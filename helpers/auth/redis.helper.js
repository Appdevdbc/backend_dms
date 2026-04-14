import { createClient } from 'redis';

let redisClient = null;

/**
 * Get Redis client instance
 * @returns {Object} Redis client
 */
const getRedisClient = async () => {
  if (!redisClient) {
    redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379
      },
      password: process.env.REDIS_PASSWORD || undefined
    });

    redisClient.on('error', (err) => {
      console.error('Redis error:', err);
    });

    await redisClient.connect();
  }

  return redisClient;
};

/**
 * Get single session data from Redis
 * @param {String} sessionId - Session ID
 * @param {String} key - Data key
 * @returns {String} Session data value
 */
export const getSessionData = async (sessionId, key) => {
  try {
    const client = await getRedisClient();
    const value = await client.get(`${sessionId}_sso_${key}_WJS`);
    return value;
  } catch (error) {
    console.error(`Error getting session data for key ${key}:`, error);
    return null;
  }
};

/**
 * Get all session data from Redis
 * @param {String} sessionId - Session ID
 * @returns {Object} All session data
 */
export const getAllSessionData = async (sessionId) => {
  const keys = [
    'user_id',
    'username',
    'email',
    'first_name',
    'last_name',
    'bu_id',
    'bu_name',
    'site_id',
    'site_name',
    'divisi_id',
    'divisi_name',
    'dept_id',
    'dept_name',
    'app',
    'group',
    'group_name'
  ];

  const data = {};
  
  for (const key of keys) {
    const value = await getSessionData(sessionId, key);
    if (value) {
      data[key] = value;
    }
  }

  return data;
};

/**
 * Clear session data from Redis
 * @param {String} sessionId - Session ID
 * @returns {Boolean} Success status
 */
export const clearSession = async (sessionId) => {
  try {
    const client = await getRedisClient();
    const keys = await client.keys(`${sessionId}_sso_*_WJS`);
    
    if (keys.length > 0) {
      await client.del(keys);
    }
    
    return true;
  } catch (error) {
    console.error('Error clearing session:', error);
    return false;
  }
};

/**
 * Check if SSO session exists
 * @param {String} sessionId - Session ID
 * @returns {Boolean} True if session exists
 */
export const sessionExists = async (sessionId) => {
  try {
    const appKey = await getSessionData(sessionId, 'app');
    return appKey !== null;
  } catch (error) {
    console.error('Error checking session:', error);
    return false;
  }
};

/**
 * Close Redis connection
 */
export const closeRedisConnection = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
};
