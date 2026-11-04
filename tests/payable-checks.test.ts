// node --experimental-strip-types --test tests/payable-checks.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abnIsValid, hasErrors, runChecks, type Extracted } from '../lib/payable-checks.ts';

const base: Extracted = {
  document_type: 'invoice',
  supplier_name: 'Bondi Homestay Network Pty Ltd',
  abn: '95 471 173 493',
  invoice_number: 'INV-10482',
  invoice_date: '2026-10-28',
  due_date: '2026-11-11',
  currency: 'AUD',
  line_items: [
    { description: 'Placement fee', quantity: 1, amount: 320 },
    { description: 'Accommodation', quantity: 4, amount: 1160 },
    { description: 'Welcome pack', quantity: 1, amount: 45 },
  ],
  subtotal: 1525,
  gst: 152.5,
  total: 1677.5,
  unclear: null,
};
const codes = (e: Extracted, existing = []) => runChecks(e, existing).filter((c) => c.level !== 'ok').map((c) => c.code);

test('ABN checksum', () => {
  assert.equal(abnIsValid('53 004 085 616'), true); // ATO published example
  assert.equal(abnIsValid('95 471 173 493'), true);
  assert.equal(abnIsValid('95 471 173 494'), false);
  assert.equal(abnIsValid('1234'), false);
});

test('a clean invoice has no problems', () => {
  assert.deepEqual(codes(base), []);
  assert.equal(hasErrors(runChecks(base, [])), false);
});

test('GST that is not 10% is an error', () => {
  const e = { ...base, line_items: [{ description: 'Transfers', quantity: 3, amount: 255 }, { description: 'Surcharge', quantity: 1, amount: 40 }], subtotal: 295, gst: 35.4, total: 330.4 };
  assert.deepEqual(codes(e), ['gst_wrong']);
});

test('line items that do not add up are an error', () => {
  assert.ok(codes({ ...base, subtotal: 1625, gst: 162.5, total: 1787.5 }).includes('lines_mismatch'));
});

test('a total that does not match subtotal plus GST is an error', () => {
  assert.ok(codes({ ...base, total: 1700 }).includes('total_mismatch'));
});

test('the same supplier and invoice number is a duplicate, unless the earlier one was rejected', () => {
  const existing = [{ id: 'x', supplier: 'OfficeHub', abn: '95471173493', invoice_number: 'inv 10482', status: 'approved' }];
  assert.ok(codes(base, existing as never).includes('duplicate'));
  assert.ok(!codes(base, [{ ...existing[0], status: 'rejected' }] as never).includes('duplicate'));
});

test('fields the AI could not read are never filled in: they become an error', () => {
  assert.ok(codes({ ...base, total: null, invoice_number: null }).includes('missing'));
});

test('missing ABN and missing due date are warnings, not errors', () => {
  const checks = runChecks({ ...base, abn: null, due_date: null }, []);
  assert.equal(hasErrors(checks), false);
  assert.deepEqual(checks.filter((c) => c.level === 'warning').map((c) => c.code), ['abn_missing', 'no_due_date']);
});
