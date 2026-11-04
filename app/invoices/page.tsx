import type { Metadata } from 'next';
import Payables from './payables';
import './invoices.css';

export const metadata: Metadata = {
  title: 'Harbour · Accounts payable',
  description: 'Demo: AI reads supplier invoices, code checks them, a person approves.',
};

export default function InvoicesPage() {
  return <Payables />;
}
