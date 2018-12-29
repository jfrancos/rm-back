// This gets called from mocha.opts

const ngrok = require("ngrok");
const app = require("../dist/app");

before(async () => {
  const url = (await ngrok.connect(process.env.PORT));
  await app.startServer(url);
  app.getUsers().drop();
});

after(() => {
  ngrok.kill();
  setTimeout(async () => {
    // await stripe.webhookEndpoints.del(webhook_id)
    app.close();
  }, 1000);
  //await stripe.webhookEndpoints.del(webhook_id);
  //app.close();
}); // so mocha doesn't hang without --exit
