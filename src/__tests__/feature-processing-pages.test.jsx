import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { db } from '@/core/db';
import CompletedLotsPage from '@/features/processing/CompletedLotsPage';
import OldBatchesPage from '@/features/processing/OldBatchesPage';
import ProcessingLotsPage from '@/features/processing/ProcessingLotsPage';
import UnitsPage from '@/features/processing/UnitsPage';
import { LOT_STATUS } from '@/features/processing/lotLogic';
import { FeedbackProvider } from '@/ui/Feedback';

// printing opens the browser print dialog: not available in tests
const print = vi.fn().mockResolvedValue();
vi.mock('@/platform', async (importOriginal) => ({
  ...(await importOriginal()),
  printHtml: (...a) => print(...a),
}));

const dyer = { id: 'dyer_1', dyeingName: 'Sri Dyes', ownerName: 'Ravi', phone: '9000000001', address: '' };
const comber = {
  id: 'proc_1',
  processorName: 'Kumar Combing',
  ownerName: 'Kumar',
  phone: '9000000002',
  address: '',
};
const issued = {
  id: 'lot_1',
  dcNo: 'DC-001',
  dcDate: '2026-10-01',
  status: LOT_STATUS.AT_DYEING,
  grey: { description: 'Grey 30s', rolls: 10, qty: 50, rate: 100 },
  finishedDescription: 'Navy Combed 30s',
  dyer: { id: 'dyer_1', name: 'Sri Dyes' },
  dyeingRate: 20,
  dyeingCharge: 1000,
  combingUnit: null,
  dyeing: null,
  received: null,
  dyeingPayments: [],
  combingPayments: [],
};

function stubDb(lots) {
  const saved = [];
  // a tiny in-memory collection: reloads after a save see what was saved
  let store = [...lots];
  vi.spyOn(db, 'getAllProcessingLots').mockImplementation(async () => store);
  vi.spyOn(db, 'getAllShortcuts').mockResolvedValue([
    { shortcutKey: 'G', fullDescription: 'Grey 30s' },
    { shortcutKey: 'N', fullDescription: 'Navy Combed 30s' },
  ]);
  vi.spyOn(db, 'getAllBankAccounts').mockResolvedValue([
    { id: 'acc_1', accountName: 'HDFC', bankName: 'HDFC' },
  ]);
  vi.spyOn(db, 'getAllDyers').mockResolvedValue([dyer]);
  vi.spyOn(db, 'getAllProcessors').mockResolvedValue([comber]);
  vi.spyOn(db, 'getAllDyeingBatches').mockResolvedValue([]);
  vi.spyOn(db, 'getAllCombingBatches').mockResolvedValue([]);
  vi.spyOn(db, 'saveProcessingLot').mockImplementation(async (lot) => {
    saved.push(lot);
    const id = lot.id || 'lot_new';
    store = [...store.filter((l) => l.id !== id), { ...lot, id }];
    return id;
  });
  vi.spyOn(db, 'saveAccountTransaction').mockResolvedValue('tx');
  return saved;
}
const renderPage = (ui) =>
  render(
    <MemoryRouter>
      <FeedbackProvider>{ui}</FeedbackProvider>
    </MemoryRouter>,
  );
const field = (label) => screen.getByLabelText(label);
afterEach(() => vi.restoreAllMocks());

describe('Processing Lots page', () => {
  test('a new lot: my DC is saved at "At Dyeing" and printed', async () => {
    const saved = stubDb([]);
    renderPage(<ProcessingLotsPage />);
    expect(await screen.findByText('Nothing at the dyeing units')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /new lot/i })[0]);
    const dialog = await screen.findByRole('dialog');
    // "DC-" is fixed in front of the box; only the number is typed
    expect(within(dialog).getByLabelText('My DC No')).toHaveValue('001');
    // the combing unit is chosen on the dyeing unit's DC, not here; no notes box
    expect(within(dialog).queryByLabelText(/Combing unit/)).toBeNull();
    expect(within(dialog).queryByLabelText(/Combing rate/)).toBeNull();
    expect(within(dialog).queryByLabelText(/Notes/)).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Grey fabric sent'), { target: { value: 'Grey 30s' } });
    fireEvent.change(within(dialog).getByLabelText('Rolls'), { target: { value: '10' } });
    fireEvent.change(within(dialog).getByLabelText('Quantity (kg)'), { target: { value: '50' } });
    fireEvent.change(within(dialog).getByLabelText('Finished product (after dyeing & combing)'), {
      target: { value: 'Navy Combed 30s' },
    });
    fireEvent.change(within(dialog).getByLabelText('Dyeing unit'), { target: { value: 'dyer_1' } });
    fireEvent.change(within(dialog).getByLabelText('Dyeing rate (₹/kg)'), { target: { value: '20' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /save & print dc/i }));
    // more than the (empty) stock: confirm
    const confirmBtn = await screen.findByRole('button', { name: 'Send anyway' });
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toMatchObject({
      dcNo: 'DC-001',
      status: LOT_STATUS.AT_DYEING,
      grey: { description: 'Grey 30s', rolls: 10, qty: 50 },
      finishedDescription: 'Navy Combed 30s',
      dyer: { id: 'dyer_1', name: 'Sri Dyes' },
      dyeingCharge: 1000,
    });
    await waitFor(() => expect(print).toHaveBeenCalled());
    expect(print.mock.calls[0][0]).toContain('DELIVERY CHALLAN');
  });

  test("dyeing unit's DC moves the lot to combing; receiving completes it with the loss shown", async () => {
    const saved = stubDb([issued]);
    renderPage(<ProcessingLotsPage />);
    fireEvent.click(await screen.findByRole('button', { name: "Dyer's DC" }));
    let dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText("Dyeing unit's DC No"), { target: { value: '77' } });
    fireEvent.change(within(dialog).getByLabelText('Dyed quantity sent (kg)'), { target: { value: '47' } });
    expect(within(dialog).getByText('3 kg (6%)')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Sent to combing unit'), { target: { value: 'proc_1' } });
    fireEvent.change(within(dialog).getByLabelText('Combing rate (₹/kg)'), { target: { value: '10' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sent to combing' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toMatchObject({
      status: LOT_STATUS.AT_COMBING,
      combingCharge: 470,
      dyeing: { dcNo: 'DC-77', qty: 47 },
    });

    // the lot moved to the "At Combing" tab, which opens by itself
    fireEvent.click(await screen.findByRole('button', { name: 'Receive' }));
    dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText("Combing unit's DC No"), { target: { value: 'DC-12' } });
    fireEvent.change(within(dialog).getByLabelText('Final quantity (kg)'), { target: { value: '45' } });
    expect(within(dialog).getByText('5 kg (10%)')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Receive & add to stock' }));
    await waitFor(() => expect(saved).toHaveLength(2));
    expect(saved[1]).toMatchObject({ status: LOT_STATUS.RECEIVED, received: { dcNo: 'DC-12', qty: 45 } });
  });

  test('paying the dyeing unit from the lot', async () => {
    const saved = stubDb([issued]);
    renderPage(<ProcessingLotsPage />);
    fireEvent.click(await screen.findByRole('button', { name: '+ Pay' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Amount (₹)')).toHaveValue('1000');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save payment' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].dyeingPayments[0]).toMatchObject({ amount: 1000, mode: 'Cash' });
    expect(db.saveAccountTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ fromAccount: 'cash', amount: 1000 }),
    );
  });
});

describe('other processing pages render', () => {
  test('completed lots show the weight loss', async () => {
    stubDb([
      {
        ...issued,
        status: LOT_STATUS.RECEIVED,
        dyeing: { dcNo: 'SD-77', date: '2026-10-05', rolls: 10, qty: 47 },
        combingUnit: { id: 'proc_1', name: 'Kumar Combing' },
        combingRate: 10,
        combingCharge: 470,
        received: { dcNo: 'KC-12', date: '2026-10-09', rolls: 9, qty: 45 },
      },
    ]);
    renderPage(<CompletedLotsPage />);
    expect(await screen.findByText('DC-001')).toBeInTheDocument();
    expect(screen.getByText(/5 kg \(10%\)/)).toBeInTheDocument();
  });
  test('dyeing units list what is due across lots', async () => {
    stubDb([issued]);
    renderPage(<UnitsPage kind="dyeing" />);
    expect(await screen.findByText('Sri Dyes')).toBeInTheDocument();
    expect(screen.getAllByText('₹1,000.00').length).toBeGreaterThan(0);
    // the unit's own orders: what it received on my DC
    expect(screen.getByText('10 rolls · 50 kg')).toBeInTheDocument();
    expect(screen.getByText('In dyeing')).toBeInTheDocument();
  });
  test('a lot that left the dyeing unit stays listed there while its charge is due; settled ones fold away', async () => {
    const dyed = {
      ...issued,
      status: LOT_STATUS.AT_COMBING,
      combingUnit: { id: 'proc_1', name: 'Kumar Combing' },
      dyeing: { dcNo: 'DC-77', date: '2026-10-05', rolls: 10, qty: 47 },
    };
    const settled = {
      ...dyed,
      id: 'lot_2',
      dcNo: 'DC-002',
      dyeingPayments: [{ id: 'p1', amount: 1000, date: '2026-10-06', method: 'cash' }],
    };
    stubDb([dyed]);
    const view = renderPage(<UnitsPage kind="dyeing" />);
    expect(await screen.findByText('Done · sent to combing')).toBeInTheDocument();
    expect(screen.getByText('Due ₹1,000.00')).toBeInTheDocument();
    view.unmount();
    stubDb([settled]);
    renderPage(<UnitsPage kind="dyeing" />);
    expect(await screen.findByText(/No lot at this unit right now/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 finished lot' }));
    expect(screen.getByText('Done · sent to combing')).toBeInTheDocument();
  });
  test('moving from Dyeing Units to Combing Units shows the combing units and their lots', async () => {
    const dyed = {
      ...issued,
      status: LOT_STATUS.AT_COMBING,
      combingUnit: { id: 'proc_1', name: 'Kumar Combing' },
      combingRate: 10,
      combingCharge: 470,
      dyeing: { dcNo: 'DC-77', date: '2026-10-05', rolls: 10, qty: 47 },
    };
    stubDb([dyed]);
    const view = renderPage(<UnitsPage kind="dyeing" />);
    expect(await screen.findByText('Sri Dyes')).toBeInTheDocument();
    view.rerender(
      <MemoryRouter>
        <FeedbackProvider>
          <UnitsPage kind="combing" />
        </FeedbackProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Kumar Combing')).toBeInTheDocument();
    expect(screen.queryByText('Sri Dyes')).toBeNull();
    expect(screen.getByText('In combing')).toBeInTheDocument();
    expect(screen.getByText('10 rolls · 47 kg')).toBeInTheDocument();
  });
  test('old batches archive', async () => {
    stubDb([]);
    db.getAllDyeingBatches.mockResolvedValue([
      {
        id: 'B-001',
        batchId: 'B-001',
        batchDate: '2026-01-01',
        processorName: 'Old Dyer',
        status: 'COMPLETED',
        input: { description: 'Grey', qty: 10 },
        output: [],
        totalDyeingCost: 500,
        payments: [],
      },
    ]);
    renderPage(<OldBatchesPage />);
    expect(await screen.findByText('B-001')).toBeInTheDocument();
    expect(screen.getByText('Due ₹500.00')).toBeInTheDocument();
  });
  test('an old batch can be deleted for good (after confirming)', async () => {
    stubDb([]);
    const batch = {
      id: 'B-001',
      batchId: 'B-001',
      batchDate: '2026-10-18',
      processorName: 'Tiruppur Dyeing',
      status: 'IN_PROCESS',
      input: { description: 'Grey', qty: 50, unit: 'Rolls' },
      output: [],
      totalDyeingCost: 1000,
      payments: [],
    };
    db.getAllDyeingBatches.mockResolvedValue([batch]);
    vi.spyOn(db, 'getDyeingBatch').mockResolvedValue(batch);
    const del = vi.spyOn(db, 'deleteDyeingBatch').mockResolvedValue();
    renderPage(<OldBatchesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    db.getAllDyeingBatches.mockResolvedValue([]);
    const ask = await screen.findByRole('dialog');
    expect(within(ask).getByText(/permanently/)).toBeInTheDocument();
    fireEvent.click(within(ask).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('B-001'));
    // the card is gone
    await waitFor(() => expect(screen.queryByText(/Tiruppur Dyeing/)).toBeNull());
  });
});

describe('lot actions: edit, payment history, returns', () => {
  const atCombing = {
    ...issued,
    status: LOT_STATUS.AT_COMBING,
    dyeing: { dcNo: 'SD-77', date: '2026-10-05', rolls: 10, qty: 47 },
    combingUnit: { id: 'proc_1', name: 'Kumar Combing' },
    combingRate: 10,
    dyeingPayments: [{ id: 'p1', date: '2026-10-06', amount: 400, mode: 'Cash' }],
  };
  test('every lot row offers the six actions (plus next step and DC print)', async () => {
    stubDb([issued]);
    renderPage(<ProcessingLotsPage />);
    for (const name of ['Edit', 'Delete', '+ Pay', 'Payments', '+ Return', 'Returns', 'DC', "Dyer's DC"]) {
      expect(await screen.findByRole('button', { name })).toBeInTheDocument();
    }
  });
  test('edit asks which DC once the dyeing DC exists', async () => {
    stubDb([atCombing]);
    renderPage(<ProcessingLotsPage />);
    fireEvent.click(await screen.findByRole('radio', { name: /At Combing/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const chooser = await screen.findByRole('dialog');
    expect(within(chooser).getByText("Dyeing unit's DC")).toBeInTheDocument();
    fireEvent.click(within(chooser).getByText("Dyeing unit's DC"));
    expect(await screen.findByLabelText("Dyeing unit's DC No")).toHaveValue('SD-77');
  });
  test('payment history lists the payments and deletes one', async () => {
    const saved = stubDb([atCombing]);
    vi.spyOn(db, 'deleteAccountTransaction').mockResolvedValue();
    renderPage(<ProcessingLotsPage />);
    fireEvent.click(await screen.findByRole('radio', { name: /At Combing/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Payments/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('₹400.00')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete payment' }));
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(2));
    fireEvent.click(within(screen.getAllByRole('dialog').at(-1)).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(saved.at(-1).dyeingPayments).toEqual([]));
    expect(db.deleteAccountTransaction).toHaveBeenCalledWith('p1');
  });
  test('a return from the combing unit goes back to stock and shows in the return history', async () => {
    const saved = stubDb([atCombing]);
    renderPage(<ProcessingLotsPage />);
    fireEvent.click(await screen.findByRole('radio', { name: /At Combing/ }));
    // the combing tab shows combing details: what the combing unit got from the dyer
    expect(await screen.findByText('Received from dyeing unit')).toBeInTheDocument();
    expect(screen.queryByText('Sent on my DC')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: '+ Return' }));
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/can return up to 47 kg/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Quantity returned (kg)'), { target: { value: '7' } });
    fireEvent.change(within(dialog).getByLabelText('Goes back into stock as'), {
      target: { value: 'Navy Dyed 30s' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save return' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].returns[0]).toMatchObject({ from: 'combing', qty: 7, description: 'Navy Dyed 30s' });

    fireEvent.click(await screen.findByRole('button', { name: /^Returns/ }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('7 kg')).toBeInTheDocument();
  });
});
