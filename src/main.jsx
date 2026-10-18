import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { AuthProvider } from '@/app/AuthProvider';
import { UpdatePrompt } from '@/app/pwa';
import { AppRoutes } from '@/app/routes';
import { PRODUCT } from '@/core/branding';
import { getBusiness, loadBusiness, subscribeBusiness, watchBusiness } from '@/core/business';
import { db } from '@/core/db';
import { getFirebaseAnalytics } from '@/core/firebase';
import { FeedbackProvider } from '@/ui';
import './styles/index.css';

// Warm up Firestore early; pages also self-initialise, so a failure here is not fatal.
db.init().catch((e) => console.error('Database init failed', e));
// The business using the app (Settings page): the device copy is used at once, Firestore refreshes it.
const showTitle = (b) => {
  document.title = b.name ? `${b.name} · Billing` : PRODUCT.name;
};
showTitle(getBusiness());
subscribeBusiness(showTitle);
void loadBusiness();
// every later change (Settings saved here, in another tab or on another device) applies at once everywhere
watchBusiness();
try {
  getFirebaseAnalytics();
} catch (e) {
  console.error('Firebase Analytics initialization failed', e);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <FeedbackProvider>
          <AppRoutes />
          <UpdatePrompt />
        </FeedbackProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
