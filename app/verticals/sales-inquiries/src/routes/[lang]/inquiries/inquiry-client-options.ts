declare const ULTRAMODERN_SALES_INQUIRIES_API_BASE_URL: string;

/** Resolved at invocation, since contract generation imports the page in Node. */
export const inquiryClientOptions = () => ({
  baseUrl: ULTRAMODERN_SALES_INQUIRIES_API_BASE_URL,
});
