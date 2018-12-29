// This gets called from mocha.opts

const ngrok = require("ngrok");
const app = require("../dist/app");
const dotenv = require("dotenv");

dotenv.config();
const stripe = require("stripe")(process.env.STRIPE_KEY);
let webhook_id;

before(async () => {
  const url = (await ngrok.connect(process.env.PORT));
  await app.startServer(url);
  app.getUsers().drop();
});

// after(async () => {
//   ngrok.kill();
//   // setTimeout(() => stripe.webhookEndpoints.del(webhook_id), 2000);
//   await stripe.webhookEndpoints.del(webhook_id);
//   app.close();
// }); // so mocha doesn't hang without --exit

after(() => {
  ngrok.kill();
  setTimeout(async () => {
    // await stripe.webhookEndpoints.del(webhook_id)
    app.close();
  }, 1000);
  //await stripe.webhookEndpoints.del(webhook_id);
  //app.close();
}); // so mocha doesn't hang without --exit
