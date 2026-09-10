-- Devolucao por venda existente: opcionalmente escolher a linha (sale_items.id).
-- Se p_return_sale_item_id for null, mantem o comportamento anterior (primeiro item por created_at).
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
  p_return_resolution text default null,
  p_sale_payment_method text default null,
  p_sale_credit_amount numeric default null,
  p_sale_notes text default null,
  p_sale_items jsonb default null
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
  v_line_idx int;
  v_item jsonb;
  v_line_qty numeric(12,3);
  v_line_unit numeric(12,2);
  v_used_custom boolean;
  v_multi boolean := false;
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

    drop table if exists _rsf_lines;
    create temporary table _rsf_lines (
      product_id uuid not null,
      product_name text not null,
      quantity numeric(12,3) not null,
      list_price numeric(12,2) not null,
      unit_price numeric(12,2) not null,
      used_custom boolean not null
    ) on commit drop;

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

        insert into _rsf_lines values (
          v_product_id,
          v_product_name,
          v_line_qty,
          v_product_list_price,
          v_line_unit,
          v_used_custom
        );
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

      insert into _rsf_lines values (
        v_product_id,
        v_product_name,
        1::numeric(12,3),
        v_product_list_price,
        v_line_unit,
        coalesce(p_sale_other_price, false)
      );
    else
      raise exception 'Informe os itens da venda (p_sale_items) ou um produto (modo legado).';
    end if;

    select coalesce(sum(quantity * unit_price), 0) into v_amount from _rsf_lines;

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
      product_id,
      product_name,
      quantity,
      list_price,
      unit_price,
      used_custom
    from _rsf_lines;

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

  if p_return_source = 'existente' then
    if p_return_existing_sale_id is null then
      raise exception 'Venda existente obrigatoria para devolucao.';
    end if;

    if p_return_sale_item_id is not null then
      select s.id, si.product_id, si.product_name, si.unit_price
        into v_sale_id, v_product_id, v_product_name, v_product_list_price
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
      select s.id, si.product_id, si.product_name, si.unit_price
        into v_sale_id, v_product_id, v_product_name, v_product_list_price
      from public.sales s
      left join public.sale_items si on si.sale_id = s.id and si.tenant_id = s.tenant_id
      where s.id = p_return_existing_sale_id
        and s.tenant_id = v_tenant_id
      order by si.created_at asc
      limit 1;

      if v_sale_id is null then
        raise exception 'Venda existente nao encontrada.';
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

  v_amount := case
    when coalesce(p_return_other_price, false) then p_return_custom_price
    else v_product_list_price
  end;

  if v_amount is null or v_amount <= 0 then
    raise exception 'Valor da devolucao invalido.';
  end if;

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
    used_custom_price,
    returned_at,
    created_by
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
    v_amount,
    coalesce(p_return_other_price, false),
    timezone('utc', now()),
    v_user_id
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
      v_amount,
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
    'amount', v_amount,
    'resolution', p_return_resolution
  );
end;
$$;
