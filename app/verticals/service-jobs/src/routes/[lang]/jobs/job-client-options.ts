declare const ULTRAMODERN_SERVICE_JOBS_API_BASE_URL: string;

/** Resolved at invocation, since contract generation imports the page in Node. */
export const jobClientOptions = () => ({
  baseUrl: ULTRAMODERN_SERVICE_JOBS_API_BASE_URL,
});
