// This gets called from mocha.opts

const ngrok = require("ngrok");
const app = require("../dist/app");
const dotenv = require("dotenv");

dotenv.config();
const stripe = require("stripe")(process.env.STRIPE_KEY);
let webhook_id;

before(async () => {
  // this will get called once mongo is initialized:
  (async () => {
    try {
      const url = (await ngrok.connect(process.env.PORT)) + "/stripe";
      const endpoint = await stripe.webhookEndpoints.create({
        url,
        enabled_events: ["*"]
      });
      // console.log(await stripe.webhookEndpoints.retrieve('we_1DlPFZEwB7PPnTr8uWWKxajK'));
      console.log(endpoint)
      webhook_id = endpoint.id;
    } catch (err) {
      console.log(err);
    }
  })();
  await app.startServer();
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
    await stripe.webhookEndpoints.del(webhook_id)
    app.close();
  }, 1000);
  //await stripe.webhookEndpoints.del(webhook_id);
  //app.close();
}); // so mocha doesn't hang without --exit
