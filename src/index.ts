import { env } from './env';
import { buildFastify } from './app';
import * as Sentry from '@sentry/node';

const port = parseInt(env.PORT || '3000', 10);
const host = env.ADDRESS || '0.0.0.0';

const app = buildFastify();

app.listen({ port, host }, (err, address) => {
  if (err) {
    console.error(err);
    Sentry.captureException(err);
  }

  // eslint-disable-next-line no-console
  console.log(`Server listening at ${address}`);
});
