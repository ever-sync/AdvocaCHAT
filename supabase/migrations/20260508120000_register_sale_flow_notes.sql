-- Observacoes opcionais na venda (sales.notes) via register_sale_flow.
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
  p_return_product_id uuid default null,
  p_return_other_price boolean default false,
  p_return_custom_price numeric default null,
  p_return_resolution text default null,
  p_sale_payment_method text default null,
  p_sale_credit_amount numeric default null,
  p_sale_notes text default null
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

    if p_sale_product_id is null then
      raise exception 'Produto da venda e obrigatorio.';
    end if;

    select id, nome, preco_venda
      into v_product_id, v_product_name, v_product_list_price
    from public.products
    where id = p_sale_product_id
      and tenant_id = v_tenant_id
    limit 1;

    if v_product_id is null then
      raise exception 'Produto nao encontrado para este tenant.';
    end if;

    v_amount := case
      when coalesce(p_sale_other_price, false) then p_sale_custom_price
      else v_product_list_price
    end;

    if v_amount is null or v_amount <= 0 then
      raise exception 'Valor da venda invalido.';
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
    values (
      v_tenant_id,
      v_sale_id,
      v_product_id,
      v_product_name,
      1,
      v_product_list_price,
      v_amount,
      coalesce(p_sale_other_price, false)
    );

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
      'credit_applied', v_sale_credit
    );
  end if;

  if p_return_resolution not in ('troca', 'credito') then
    raise exception 'Destino da devolucao invalido. Use troca ou credito.';
  end if;

  if p_return_source = 'existente' then
    if p_return_existing_sale_id is null then
      raise exception 'Venda existente obrigatoria para devolucao.';
    end if;

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
