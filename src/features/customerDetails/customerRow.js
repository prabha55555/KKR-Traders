import { customerBalance } from './aggregate';
import { buildRowModel } from './rowModel';

/** One customer summary as a row of the shared party list (see PartyRow in `@/components/party`). */
export function toCustomerRow(customer) {
  const m = buildRowModel(customer);
  return {
    key: customer.name,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    invoiceCount: m.invoices,
    invoiceNumbers: customer.allInvoiceNumbers,
    openingBalance: m.openingBalance,
    amount: m.amount,
    paid: m.paid,
    discount: m.discount,
    returns: m.returns,
    balance: m.balance,
    balanceValue: customerBalance(customer),
    hasReturns: m.hasReturns,
    source: customer,
  };
}
