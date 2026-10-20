/**
 * Stripe Billing & Checkout Client Utility
 *
 * Facilitates Stripe Checkout redirects for Pro subscription purchases.
 * Integrates with Stripe Payment Links or direct Stripe Checkout Sessions.
 */

export interface StripeCheckoutOptions {
  /**
   * Firebase User ID (client_reference_id) to link with subscription
   */
  userId: string;
  /**
   * Customer email (optional, pre-populates email on checkout page)
   */
  customerEmail?: string;
  /**
   * Stripe Payment Link URL (e.g. from environment variable or Stripe dashboard)
   */
  paymentLinkUrl?: string;
  /**
   * Return URL after successful payment
   */
  successUrl?: string;
  /**
   * Return URL if payment is cancelled
   */
  cancelUrl?: string;
}

/**
 * Triggers a redirect to Stripe Checkout, embedding the Firebase UID
 * as the `client_reference_id` query parameter so Stripe Webhooks can identify
 * and upgrade the user upon completion.
 *
 * @param options Stripe checkout options containing the userId
 */
export function redirectToStripeCheckout(options: StripeCheckoutOptions): void {
  const {
    userId,
    customerEmail,
    paymentLinkUrl = import.meta.env.VITE_STRIPE_PAYMENT_LINK_URL || '',
    successUrl = `${window.location.origin}?checkout=success`,
    cancelUrl = `${window.location.origin}?checkout=cancel`
  } = options;

  if (!userId) {
    console.error('redirectToStripeCheckout: Missing userId');
    throw new Error('User must be logged in to proceed to checkout.');
  }

  if (!paymentLinkUrl) {
    console.warn(
      'redirectToStripeCheckout: VITE_STRIPE_PAYMENT_LINK_URL is not set. ' +
      'Please configure your Stripe Payment Link in .env or pass paymentLinkUrl explicitly.'
    );
  }

  // Construct target URL using Stripe Payment Link
  const targetUrl = new URL(paymentLinkUrl || 'https://buy.stripe.com/test');
  targetUrl.searchParams.set('client_reference_id', userId);

  if (customerEmail) {
    targetUrl.searchParams.set('prefilled_email', customerEmail);
  }

  // Optional query parameters if supported by custom checkout redirect
  if (successUrl) {
    targetUrl.searchParams.set('success_url', successUrl);
  }
  if (cancelUrl) {
    targetUrl.searchParams.set('cancel_url', cancelUrl);
  }

  // Redirect to Stripe checkout
  window.location.href = targetUrl.toString();
}
