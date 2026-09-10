-- Estorno de devolucao: void_return marca voided_at, reverte estoque, remove credito quando aplicavel.
-- Somatorio de quantidade ja devolvida em register_sale_flow ignora devolucoes estornadas.

alter table public.returns
  add column if not exists voided_at timestamptz;

drop policy if exists "customer_credits_same_tenant_delete" on public.customer_credits;
create policy "customer_credits_same_tenant_delete"
on public.customer_credits
for delete
using (public.is_same_tenant(tenant_id));

create or replace function public.void_return(p_return_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_qty numeric(12,3);
  v_resolution text;
  v_customer_id uuid;
  v_product_id uuid;
  v_voided_at timestamptz;
  v_balance numeric(12,2);
  v_credit_id uuid;
  v_credit_amt numeric(12,2);
  v_updated int;
  v_now timestamptz := timezone('utc', now());
begin
  if v_tenant_id is null then
    raise exception 'Tenant nao encontrado para o usuario autenticado.';
  end if;

  if p_return_id is null then
    raise exception 'Devolucao invalida.';
  end if;

  select
    r.quantity,
    r.product_id,
    r.resolution,
    r.customer_id,
    r.voided_at
  into
    v_qty,
    v_product_id,
    v_resolution,
    v_customer_id,
    v_voided_at
  from public.returns r
  where r.id = p_return_id
    and r.tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'Devolucao nao encontrada.';
  end if;

  if v_voided_at is not null then
    raise exception 'Esta devolucao ja foi estornada.';
  end if;

  v_qty := round(coalesce(v_qty, 1::numeric), 3);
  if v_qty is null or v_qty <= 0 then
    raise exception 'Quantidade invalida no registro de devolucao.';
  end if;

  if v_resolution = 'credito' then
    if v_customer_id is null then
      raise exception 'Cliente nao vinculado ao credito desta devolucao.';
    end if;

    select cc.id, cc.amount
      into v_credit_id, v_credit_amt
    from public.customer_credits cc
    where cc.tenant_id = v_tenant_id
      and cc.return_id = p_return_id
      and cc.type = 'credit_from_return'
    limit 1;

    if v_credit_id is null then
      raise exception 'Lancamento de credito nao encontrado para esta devolucao.';
    end if;

    select coalesce(sum(
      case cc.type
        when 'credit_from_return' then cc.amount
        when 'debit_usage' then -cc.amount
      end
    ), 0)
      into v_balance
    from public.customer_credits cc
    where cc.tenant_id = v_tenant_id
      and cc.customer_id = v_customer_id;

    if v_balance < v_credit_amt then
      raise exception 'Saldo de credito insuficiente para estornar este lancamento (credito ja utilizado).';
    end if;

    delete from public.customer_credits cc
    where cc.id = v_credit_id
      and cc.tenant_id = v_tenant_id;
  end if;

  if v_product_id is not null then
    update public.products p
    set qtd_estoque = p.qtd_estoque - v_qty
    where p.id = v_product_id
      and p.tenant_id = v_tenant_id
      and p.qtd_estoque >= v_qty;

    get diagnostics v_updated = row_count;

    if v_updated = 0 then
      raise exception 'Estoque insuficiente para estornar a devolucao (produto nao encontrado ou saldo fisico baixo).';
    end if;
  end if;

  update public.returns r
  set voided_at = v_now
  where r.id = p_return_id
    and r.tenant_id = v_tenant_id
    and r.voided_at is null;

  return jsonb_build_object(
    'return_id', p_return_id,
    'voided_at', v_now,
    'resolution', v_resolution
  );
end;
$$;

grant execute on function public.void_return(uuid) to authenticated;
create or replace function public.register_sale_flow(
  p_chat_id uuid,
  p_customer_id uuid,
  p_flow_type text,
  p_sold_by text default null,
  p_sale_product_id uuid default null,
  p_sale_other_price boolean default false,
  p_sale_custom_price numeric default null,
  p_return_source text default null,
  p_return_existing_sale_id uuid default null,
  p_return_sale_item_id uuid default null,
  p_return_product_id uuid default null,
  p_return_other_price boolean default false,
  p_return_custom_price numeric default null,
  p_return_quantity numeric default null,
  p_return_resolution text default null,
  p_sale_payment_method text default null,
  p_sale_credit_amount numeric default null,
  p_sale_notes text default null,
  p_sale_items jsonb default null,
  p_return_notes text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_user_id uuid := auth.uid();
  v_sale_id uuid;
  v_return_id uuid;
  v_credit_id uuid;
  v_amount numeric(12,2);
  v_product_id uuid;
  v_product_name text;
  v_product_list_price numeric(12,2);
  v_source text;
  v_sale_credit numeric(12,2) := 0;
  v_customer_balance numeric(12,2);
  v_payment_method text;
  v_sale_notes text;
  v_item jsonb;
  v_prepared_items jsonb := '[]'::jsonb;
  v_line_qty numeric(12,3);
  v_line_unit numeric(12,2);
  v_used_custom boolean;
  v_multi boolean := false;
  v_sale_item_id uuid;
  v_line_qty_sold numeric(12,3);
  v_already_returned numeric(12,3);
  v_max_return numeric(12,3);
  v_return_qty numeric(12,3);
  v_credit_amount numeric(12,2);
  v_return_notes text;
begin
  if v_tenant_id is null then
    raise exception 'Tenant nao encontrado para o usuario autenticado.';
  end if;

  if p_flow_type not in ('venda', 'devolucao') then
    raise exception 'Tipo invalido. Use venda ou devolucao.';
  end if;

  if p_flow_type = 'venda' then
    if p_sold_by is null or btrim(p_sold_by) = '' then
      raise exception 'Usuario responsavel pela venda e obrigatorio.';
    end if;

    v_amount := 0;

    if p_sale_items is not null
      and jsonb_typeof(p_sale_items) = 'array'
      and jsonb_array_length(p_sale_items) > 0 then
      v_multi := true;

      for v_line_idx in 0 .. jsonb_array_length(p_sale_items) - 1 loop
        v_item := p_sale_items -> v_line_idx;

        if v_item is null or jsonb_typeof(v_item) <> 'object' then
          raise exception 'Item de venda invalido na posicao %.', v_line_idx + 1;
        end if;

        v_product_id := nullif(trim(v_item->>'product_id'), '')::uuid;

        if v_product_id is null then
          raise exception 'product_id obrigatorio em cada item (posicao %).', v_line_idx + 1;
        end if;

        v_line_qty := round(coalesce(nullif(trim(v_item->>'quantity'), '')::numeric, 1::numeric), 3);

        if v_line_qty is null or v_line_qty <= 0 then
          raise exception 'Quantidade invalida no item %.', v_line_idx + 1;
        end if;

        v_used_custom := coalesce((v_item->>'other_price')::boolean, false);

        select p.id, p.nome, p.preco_venda
          into v_product_id, v_product_name, v_product_list_price
        from public.products p
        where p.id = v_product_id
          and p.tenant_id = v_tenant_id
        limit 1;

        if v_product_name is null then
          raise exception 'Produto nao encontrado para este tenant (item %).', v_line_idx + 1;
        end if;

        if v_used_custom then
          v_line_unit := round(coalesce(nullif(trim(v_item->>'custom_unit_price'), '')::numeric, null), 2);
        else
          v_line_unit := v_product_list_price;
        end if;

        if v_line_unit is null or v_line_unit <= 0 then
          raise exception 'Preco unitario invalido no item % (produto %).', v_line_idx + 1, v_product_name;
        end if;

        v_prepared_items := v_prepared_items || jsonb_build_object(
          'product_id', v_product_id,
          'product_name', v_product_name,
          'quantity', v_line_qty,
          'list_price', v_product_list_price,
          'unit_price', v_line_unit,
          'used_custom', v_used_custom
        );
        v_amount := v_amount + (v_line_qty * v_line_unit);
      end loop;

    elsif p_sale_product_id is not null then
      select id, nome, preco_venda
        into v_product_id, v_product_name, v_product_list_price
      from public.products
      where id = p_sale_product_id
        and tenant_id = v_tenant_id
      limit 1;

      if v_product_id is null then
        raise exception 'Produto nao encontrado para este tenant.';
      end if;

      v_line_unit := case
        when coalesce(p_sale_other_price, false) then p_sale_custom_price
        else v_product_list_price
      end;

      if v_line_unit is null or v_line_unit <= 0 then
        raise exception 'Valor da venda invalido.';
      end if;

      v_prepared_items := v_prepared_items || jsonb_build_object(
        'product_id', v_product_id,
        'product_name', v_product_name,
        'quantity', 1::numeric(12,3),
        'list_price', v_product_list_price,
        'unit_price', v_line_unit,
        'used_custom', coalesce(p_sale_other_price, false)
      );
      v_amount := v_amount + (1::numeric(12,3) * v_line_unit);
    else
      raise exception 'Informe os itens da venda (p_sale_items) ou um produto (modo legado).';
    end if;

    if v_amount is null or v_amount <= 0 then
      raise exception 'Valor total da venda invalido.';
    end if;

    v_payment_method := lower(coalesce(nullif(btrim(p_sale_payment_method), ''), ''));

    if v_payment_method = 'credito_loja' then
      v_sale_credit := v_amount;
    else
      v_sale_credit := round(coalesce(p_sale_credit_amount, 0)::numeric, 2);

      if v_sale_credit < 0 then
        raise exception 'Valor de credito aplicado invalido.';
      end if;

      if v_sale_credit > v_amount then
        raise exception 'Credito aplicado nao pode ser maior que o valor da venda.';
      end if;

      if v_sale_credit >= v_amount then
        v_sale_credit := v_amount;
        v_payment_method := 'credito_loja';
      end if;
    end if;

    if v_payment_method is null or btrim(v_payment_method) = '' then
      raise exception 'Forma de pagamento obrigatoria.';
    end if;

    if v_payment_method not in (
      'pix',
      'dinheiro',
      'cartao_credito',
      'cartao_debito',
      'boleto',
      'fiado',
      'credito_loja',
      'outro'
    ) then
      raise exception 'Forma de pagamento invalida.';
    end if;

    if v_sale_credit < v_amount and v_payment_method = 'credito_loja' then
      raise exception 'Credito parcial exige outra forma de pagamento para o restante.';
    end if;

    if v_sale_credit > 0 and p_customer_id is null then
      raise exception 'Cliente obrigatorio para usar saldo de credito.';
    end if;

    if v_sale_credit > 0 then
      select coalesce(sum(
        case type
          when 'credit_from_return' then amount
          when 'debit_usage' then -amount
        end
      ), 0)
        into v_customer_balance
      from public.customer_credits
      where tenant_id = v_tenant_id
        and customer_id = p_customer_id;

      if v_customer_balance < v_sale_credit then
        raise exception 'Saldo de credito insuficiente.';
      end if;
    end if;

    v_sale_notes := nullif(left(btrim(coalesce(p_sale_notes, '')), 2000), '');

    insert into public.sales (
      tenant_id,
      customer_id,
      chat_id,
      sold_by,
      sold_at,
      payment_method,
      notes,
      created_by
    )
    values (
      v_tenant_id,
      p_customer_id,
      p_chat_id,
      p_sold_by,
      timezone('utc', now()),
      v_payment_method,
      v_sale_notes,
      v_user_id
    )
    returning id into v_sale_id;

    insert into public.sale_items (
      tenant_id,
      sale_id,
      product_id,
      product_name,
      quantity,
      list_price,
      unit_price,
      used_custom_price
    )
    select
      v_tenant_id,
      v_sale_id,
      (value->>'product_id')::uuid,
      value->>'product_name',
      (value->>'quantity')::numeric(12,3),
      (value->>'list_price')::numeric(12,2),
      (value->>'unit_price')::numeric(12,2),
      (value->>'used_custom')::boolean
    from jsonb_array_elements(v_prepared_items);

    if v_sale_credit > 0 then
      insert into public.customer_credits (
        tenant_id,
        customer_id,
        return_id,
        sale_id,
        type,
        amount,
        description,
        created_by
      )
      values (
        v_tenant_id,
        p_customer_id,
        null,
        v_sale_id,
        'debit_usage',
        v_sale_credit,
        'Uso de credito na venda',
        v_user_id
      );
    end if;

    return jsonb_build_object(
      'flow_type', 'venda',
      'sale_id', v_sale_id,
      'amount', v_amount,
      'payment_method', v_payment_method,
      'credit_applied', v_sale_credit,
      'multi_item', v_multi
    );
  end if;

  if p_return_resolution not in ('troca', 'credito') then
    raise exception 'Destino da devolucao invalido. Use troca ou credito.';
  end if;

  v_sale_item_id := null;
  v_line_qty_sold := null;

  if p_return_source = 'existente' then
    if p_return_existing_sale_id is null then
      raise exception 'Venda existente obrigatoria para devolucao.';
    end if;

    if p_return_sale_item_id is not null then
      select s.id, si.id, si.product_id, si.product_name, si.unit_price, si.quantity
        into v_sale_id, v_sale_item_id, v_product_id, v_product_name, v_product_list_price, v_line_qty_sold
      from public.sale_items si
      inner join public.sales s
        on s.id = si.sale_id
        and s.tenant_id = si.tenant_id
      where si.id = p_return_sale_item_id
        and si.tenant_id = v_tenant_id
        and s.id = p_return_existing_sale_id;

      if v_sale_id is null then
        raise exception 'Linha de venda invalida ou nao pertence a esta venda.';
      end if;
    else
      select s.id, si.id, si.product_id, si.product_name, si.unit_price, si.quantity
        into v_sale_id, v_sale_item_id, v_product_id, v_product_name, v_product_list_price, v_line_qty_sold
      from public.sales s
      inner join public.sale_items si on si.sale_id = s.id and si.tenant_id = s.tenant_id
      where s.id = p_return_existing_sale_id
        and s.tenant_id = v_tenant_id
      order by si.created_at asc
      limit 1;

      if v_sale_id is null or v_sale_item_id is null then
        raise exception 'Venda existente nao encontrada ou sem itens.';
      end if;
    end if;

    if p_customer_id is null then
      select s.customer_id into p_customer_id
      from public.sales s
      where s.id = v_sale_id;
    end if;

    v_source := 'existing_sale';
  elsif p_return_source = 'outra' then
    if p_return_product_id is null then
      raise exception 'Produto e obrigatorio para devolucao de outra venda.';
    end if;

    select id, nome, preco_venda
      into v_product_id, v_product_name, v_product_list_price
    from public.products
    where id = p_return_product_id
      and tenant_id = v_tenant_id
      limit 1;

    if v_product_id is null then
      raise exception 'Produto nao encontrado para este tenant.';
    end if;

    v_source := 'other_sale';
  else
    raise exception 'Origem da devolucao invalida. Use existente ou outra.';
  end if;

  if v_source = 'existing_sale' then
    select coalesce(sum(r.quantity), 0)
      into v_already_returned
    from public.returns r
    where r.tenant_id = v_tenant_id
      and r.sale_item_id = v_sale_item_id
      and r.voided_at is null;

    v_max_return := v_line_qty_sold - v_already_returned;
    if v_max_return <= 0 then
      raise exception 'Nada a devolver nesta linha (quantidade ja devolvida).';
    end if;

    v_return_qty := round(coalesce(p_return_quantity, 1::numeric), 3);
    if v_return_qty <= 0 then
      raise exception 'Quantidade de devolucao invalida.';
    end if;
    if v_return_qty > v_max_return then
      raise exception 'Quantidade acima do disponivel para devolucao (max %).', v_max_return;
    end if;
  else
    v_return_qty := round(coalesce(p_return_quantity, 1::numeric), 3);
    if v_return_qty <= 0 then
      raise exception 'Quantidade de devolucao invalida.';
    end if;
  end if;

  if coalesce(p_return_other_price, false) then
    if p_return_custom_price is null or p_return_custom_price <= 0 then
      raise exception 'Valor da devolucao invalido.';
    end if;
    v_credit_amount := round(p_return_custom_price, 2);
  else
    v_credit_amount := round(v_product_list_price * v_return_qty, 2);
  end if;

  if v_credit_amount is null or v_credit_amount <= 0 then
    raise exception 'Valor da devolucao invalido.';
  end if;

  v_return_notes := nullif(left(btrim(coalesce(p_return_notes, '')), 2000), '');

  insert into public.returns (
    tenant_id,
    customer_id,
    chat_id,
    sale_id,
    source,
    resolution,
    product_id,
    product_name,
    amount,
    quantity,
    sale_item_id,
    used_custom_price,
    returned_at,
    created_by,
    notes
  )
  values (
    v_tenant_id,
    p_customer_id,
    p_chat_id,
    v_sale_id,
    v_source,
    p_return_resolution,
    v_product_id,
    v_product_name,
    v_credit_amount,
    v_return_qty,
    v_sale_item_id,
    coalesce(p_return_other_price, false),
    timezone('utc', now()),
    v_user_id,
    v_return_notes
  )
  returning id into v_return_id;

  if p_return_resolution = 'credito' then
    if p_customer_id is null then
      raise exception 'Nao e possivel gerar credito sem cliente vinculado.';
    end if;

    insert into public.customer_credits (
      tenant_id,
      customer_id,
      return_id,
      sale_id,
      type,
      amount,
      description,
      created_by
    )
    values (
      v_tenant_id,
      p_customer_id,
      v_return_id,
      null,
      'credit_from_return',
      v_credit_amount,
      'Credito gerado por devolucao',
      v_user_id
    )
    returning id into v_credit_id;
  end if;

  return jsonb_build_object(
    'flow_type', 'devolucao',
    'return_id', v_return_id,
    'sale_id', v_sale_id,
    'credit_id', v_credit_id,
    'amount', v_credit_amount,
    'return_quantity', v_return_qty,
    'resolution', p_return_resolution
  );
end;
$$;
