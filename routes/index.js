const express = require('express');

const { options, redirectUrl, samlPath } = require('../jackson');

const router = express.Router();

let apiController;
let oauthController;

const tenant = process.env.BOXYHQ_TENANT || 'example.com';
const product = process.env.BOXYHQ_PRODUCT || 'saml-demo.boxyhq.com';

(async function init() {
  const jackson = await require('@boxyhq/saml-jackson').controllers(options);
console.log("INIT");
  console.log(options);
  
  apiController = jackson.connectionAPIController;
  oauthController = jackson.oauthController;
})();

router.use(function (req, res, next) {
  // Make `profile` available in templates
  res.locals.profile = req.session.profile;

  next();
});

// Home
router.get('/', async (req, res) => {
  console.log("HOME PAGE")
  return res.render('index');
});

// Show form to add Metadata
router.get('/settings', async (req, res, next) => {
  console.log("SETTINGS PAGE")
  try {
    // Get the SAML SSO connection
    const connections = await apiController.getConnections({
      tenant,
      product,
    });

    // console.log('connections', connections || [])

    res.render('settings', {
      hasConnection: connections.length > 0,
    });
  } catch (err) {
    next(err);
  }
});

// Store the Metadata
router.post('/settings', async (req, res, next) => {

  console.log("STORING METADATA", req.body.rawMetadata)
  const { rawMetadata } = req.body;

  try {
    // Create SAML SSO connection
    await apiController.createSAMLConnection({
      rawMetadata,
      defaultRedirectUrl: redirectUrl,
      redirectUrl,
      tenant,
      product,
    });

    // console.log("apiController", apiController)

    res.redirect('/settings');
  } catch (err) {
    next(err);
  }
});

// SSO Login
router.get('/sso', async (req, res, next) => {
  console.log("SSO PAGE")
  res.render('login');
});

router.post('/sso', async (req, res, next) => {
  // Extract the tenant from the email address
  const tenant = req.body.email.split('@')[1];

  console.log("SSO POST");
  console.log("TENANT", tenant);
  console.log("PRODUCT", product);
  console.log("REDICT URI", redirectUrl);

  try {
    const { redirect_url } = await oauthController.authorize({
      tenant,
      product,
      state: 'a-random-state-value',
      redirect_uri: redirectUrl,
    });

    console.log("REDIRECT URL", redirect_url)
    res.redirect(redirect_url);
  } catch (err) {
    next(err);
  }
});

// Handle the SAML Response from IdP
//NOTE: THIS IS THE ACSURL
// /api/oauth/saml
router.post(samlPath, async (req, res, next) => {
  console.log("POST", samlPath)
  
  const { RelayState, SAMLResponse } = req.body;

  console.log("RELAY STATE", RelayState)
  console.log("SAML RESPONSE", SAMLResponse)

  try {
    //console.log(oauthController)
    const connections = await apiController.getConnections({
      tenant,
      product,
    });

    console.log('connections', connections || [])

    const { redirect_url } = await oauthController.samlResponse({ RelayState, SAMLResponse });

    console.log("REDIRECT URL", redirect_url)
    res.redirect(redirect_url);

  } catch (err) {
    next(err);
  }
});

// Callback (Redirect URL)
router.get('/sso/callback', async (req, res, next) => {

  const { code, state } = req.query;

  // TODO: Validate state

  try {

    const { access_token, id_token } = await oauthController.token({
      code,
      client_id: `tenant=${tenant}&product=${product}`,
      client_secret: 'dummy',
      redirect_uri: redirectUrl,
    });

    // Get the profile infor using the access_token
    const { id, email, firstName, lastName } = await oauthController.userInfo(access_token);

    req.session.profile = { id, email, firstName, lastName };

    res.redirect('/profile');
  } catch (err) {
    next(err);
  }
});

// Display the user profile
router.get('/profile', async (req, res, next) => {
  const { profile } = req.session;

  if (profile === undefined) {
    return res.redirect('/sso');
  }

  res.render('profile', { profile });
});

// Log out
router.get('/logout', async (req, res, next) => {
  req.session.destroy();

  return res.redirect('/sso');
});

module.exports = router;
