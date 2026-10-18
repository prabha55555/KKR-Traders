import { PAGE_SIZE, pageSlice } from '@/features/overview/components/paging';
describe('pageSlice', () => {
  const rows = Array.from({ length: 250 }, (_, i) => i);
  test('short lists are returned untouched', () => {
    const short = [1, 2, 3];
    expect(pageSlice(short, PAGE_SIZE)).toEqual({ rows: short, remaining: 0 });
    expect(pageSlice(short, PAGE_SIZE).rows).toBe(short);
    expect(pageSlice(rows.slice(0, PAGE_SIZE), PAGE_SIZE).remaining).toBe(0);
  });
  test('long lists are cut at the limit and report what is left', () => {
    expect(PAGE_SIZE).toBe(100);
    const first = pageSlice(rows, PAGE_SIZE);
    expect(first.rows).toHaveLength(100);
    expect(first.remaining).toBe(150);
    expect(pageSlice(rows, 200)).toMatchObject({ remaining: 50 });
    expect(pageSlice(rows, 300)).toEqual({ rows, remaining: 0 });
  });
});
