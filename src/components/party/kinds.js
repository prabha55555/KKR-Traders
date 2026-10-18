import { Truck, Users } from 'lucide-react';

/**
 * The two kinds of party the details pages list. Every label of the shared party components comes from here, so the
 * Customer Details and Supplier Details pages always read the same way.
 *
 *  name / plural      'Customer' / 'Customers'    (headings, tile labels)
 *  noun / nouns       'customer' / 'customers'    (sentences, pager, aria labels)
 *  module             route module of its invoices (TotalInvoicesClickable → /<module>/history?search=)
 *  title, icon        page title and its icon tile
 *  searchPlaceholder  what the search box matches (customers also match invoice numbers)
 *  emptyMessage       empty list with no search
 */
export const PARTY_KINDS = {
  customer: {
    name: 'Customer',
    plural: 'Customers',
    noun: 'customer',
    nouns: 'customers',
    module: 'sales',
    title: 'Customer Details',
    icon: Users,
    searchPlaceholder: 'Search customer name, phone, address or invoice no',
    emptyMessage: 'Add customers or create invoices to see customer data here',
  },
  supplier: {
    name: 'Supplier',
    plural: 'Suppliers',
    noun: 'supplier',
    nouns: 'suppliers',
    module: 'purchase',
    title: 'Supplier Details',
    icon: Truck,
    searchPlaceholder: 'Search supplier name, phone or address',
    emptyMessage: 'Add suppliers or create purchase bills to see supplier data here',
  },
};
