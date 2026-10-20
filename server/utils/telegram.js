/**
 * Telegram WebApp initData validation
 * Official algorithm: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
const crypto = require('crypto');

/**
 * Validate Telegram WebApp initData
 * @param {string} initData - raw initData string from Telegram.WebApp.initData
 * @param {string} botToken - Bot token from BotFather
 * @param {number} maxAgeSeconds - max age of auth_date (default 1 day)
 * @returns {{ valid: boolean, user?: object, error?: string }}
 */
function validateInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!initData || !botToken) {
    return { valid: false, error: 'Missing initData or bot token' };
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return { valid: false, error: 'No hash in initData' };

    params.delete('hash');

    // Sort keys alphabetically and build data-check-string
    const entries = [];
    for (const [key, value] of params.entries()) {
      entries.push(`${key}=${value}`);
    }
    entries.sort();
    const dataCheckString = entries.join('\n');

    // secret_key = HMAC_SHA256(<bot_token>, "WebAppData")
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // calculated_hash = HMAC_SHA256(data_check_string, secret_key)
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      return { valid: false, error: 'Hash mismatch – invalid initData' };
    }

    // Check auth_date freshness
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > maxAgeSeconds) {
      return { valid: false, error: 'initData expired' };
    }

    // Parse user
    let user = null;
    const userJson = params.get('user');
    if (userJson) {
      user = JSON.parse(userJson);
    }

    // start_param for referral
    const startParam = params.get('start_param') || null;

    return {
      valid: true,
      user,
      startParam,
      authDate,
      queryId: params.get('query_id') || null
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Generate a short referral code from user id
 */
function generateReferralCode(telegramId) {
  const hash = crypto.createHash('sha256').update(String(telegramId) + (process.env.REFERRAL_SALT || 'hype')).digest('hex');
  return 'HYPE' + hash.slice(0, 8).toUpperCase();
}

module.exports = {
  validateInitData,
  generateReferralCode
};
