// This gets called from mocha.opts

const ngrok = require("ngrok");
const app = require("../dist/app");
const dotenv = require("dotenv");

dotenv.config();
const stripe = require("stripe")(process.env.STRIPE_KEY);
let webhook_id;

before(done => {
  // this will get called once mongo is initialized:
  (async () => {
    try {
      const url = (await ngrok.connect(process.env.PORT)) + "/stripe";
      const endpoint = await stripe.webhookEndpoints.create({
        url,
        enabled_events: ["*"]
      });
      webhook_id = endpoint.id;
    } catch (err) {
      console.log(err);
    }
  })();

  // I think there's a race condition here: if users is already ready when
  // setMochaCAllback is called it won't get called (?)
  app.setMochaCallback(() => {
    //    we don't want mocha to manipulate db before it's up.
    app.getUsers().drop(); // empty db before starting tests
    done(); // now we can start tests
  });
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
