import { Pagination } from '@/ui';

/** Page selector under a paged overview list (see usePagedRows); renders nothing when everything fits on one page. */
export default function ShowMore({ pager, noun = 'records' }) {
  return <Pagination pager={pager} noun={noun} />;
}
