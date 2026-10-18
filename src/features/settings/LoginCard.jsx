import { KeyRound, Save } from 'lucide-react';
import { useRef, useState } from 'react';

import { useAuth } from '@/app/AuthProvider';
import { setClientLogin } from '@/core/admin';
import { Badge, Button, Card, Grid, SectionHeader, TextField, useFeedback } from '@/ui';

const blank = (username) => ({ username, password: '', confirmPassword: '' });

/**
 * "Client login" card of the Settings page (administrator only, saved on its own): the username / password that open
 * the app for the client. The administrator sets it without the client's current password; it is stored only as a
 * salted hash (core/admin.js setClientLogin) and the session on this device carries on under the new username.
 */
export function LoginCard() {
  const { username, renameSession } = useAuth();
  const { toast } = useFeedback();
  const [values, setValues] = useState(() => blank(username ?? ''));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const bind = (key) => ({
    value: values[key],
    onChange: (v) => {
      setValues((s) => ({ ...s, [key]: v }));
      setError('');
    },
  });

  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError('');
    try {
      const newUsername = await setClientLogin({
        username: values.username,
        password: values.password,
        confirmPassword: values.confirmPassword,
      });
      renameSession(newUsername);
      setValues(blank(newUsername));
      toast(
        'Client login changed',
        'The client signs in with the new username and password from now on.',
        'success',
      );
    } catch (err) {
      setError(err?.message || 'The login could not be changed. Please try again.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <Card as="section" aria-label="Client login">
      <SectionHeader
        title="Client login"
        icon={KeyRound}
        right={
          <Badge tone="neutral" title="The username signed in on this device">
            Signed in as {username || '—'}
          </Badge>
        }
      />
      <p className="-mt-1 mb-4 text-sm text-slate-600">
        The username and password the client uses to open this app on every device. Until one is set, the app
        uses the default login it was installed with.
      </p>
      <form onSubmit={onSubmit} noValidate aria-label="Client login">
        <Grid cols={{ base: 1, sm: 2 }}>
          <TextField
            label="New username"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            hint="At least 3 characters."
            className="sm:col-span-2"
            {...bind('username')}
          />
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            hint="At least 6 characters."
            {...bind('password')}
          />
          <TextField
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            hint="Type the new password again."
            {...bind('confirmPassword')}
          />
        </Grid>
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 ring-1 ring-red-200"
          >
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end">
          <Button type="submit" variant="success" icon={Save} loading={saving}>
            Save client login
          </Button>
        </div>
      </form>
    </Card>
  );
}
