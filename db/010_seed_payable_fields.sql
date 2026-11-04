-- The invoice "approved last month" only stored its line items, so its review
-- screen showed every field as missing. Store the full reading, like a real one.

create or replace function harbour.seed_payables() returns void
language sql as $$
  insert into harbour.payables (source, sample_key, status, supplier, abn, invoice_number, invoice_date, due_date,
                                subtotal_cents, gst_cents, total_cents, decided_at, decision_note, extracted, checks)
  values ('seed', 'officehub', 'approved', 'OfficeHub Supplies', '31864452323', 'OH-2291', date '2026-10-15', date '2026-11-14',
          30300, 3030, 33330, now() - interval '12 days', 'Approved by Alex',
          '{"document_type":"invoice","supplier_name":"OfficeHub Supplies","abn":"31 864 452 323","invoice_number":"OH-2291",
            "invoice_date":"2026-10-15","due_date":"2026-11-14","currency":"AUD","subtotal":303,"gst":30.3,"total":333.3,"unclear":null,
            "line_items":[{"description":"A4 copy paper (ream)","quantity":10,"amount":65},{"description":"Printer toner cartridge","quantity":2,"amount":178},{"description":"Student welcome folders","quantity":50,"amount":60}]}'::jsonb,
          '[{"level":"ok","code":"abn_valid","message":"The ABN is valid."},{"level":"ok","code":"lines_match","message":"The items add up."},{"level":"ok","code":"gst_ok","message":"GST is 10%, as it should be."}]'::jsonb);
$$;

update harbour.payables p
   set extracted = s.extracted, checks = s.checks
  from (select '{"document_type":"invoice","supplier_name":"OfficeHub Supplies","abn":"31 864 452 323","invoice_number":"OH-2291",
                 "invoice_date":"2026-10-15","due_date":"2026-11-14","currency":"AUD","subtotal":303,"gst":30.3,"total":333.3,"unclear":null,
                 "line_items":[{"description":"A4 copy paper (ream)","quantity":10,"amount":65},{"description":"Printer toner cartridge","quantity":2,"amount":178},{"description":"Student welcome folders","quantity":50,"amount":60}]}'::jsonb as extracted,
               '[{"level":"ok","code":"abn_valid","message":"The ABN is valid."},{"level":"ok","code":"lines_match","message":"The items add up."},{"level":"ok","code":"gst_ok","message":"GST is 10%, as it should be."}]'::jsonb as checks) s
 where p.source = 'seed';

-- uploads can now be PDFs as well as photos
comment on column harbour.payables.image_data is 'uploads only: a downscaled JPEG or a PDF, as a data URL';
