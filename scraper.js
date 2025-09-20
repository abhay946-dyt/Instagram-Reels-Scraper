const axios = require('axios');
const axiosRetry = require('axios-retry').default; 
const logger = require('./logger');

const INSTAGRAM_BASE_URL = 'https://www.instagram.com';
const GRAPHQL_ENDPOINT = `${INSTAGRAM_BASE_URL}/graphql/query`;
const MOBILE_API_BASE = 'https://i.instagram.com/api/v1';


const WEB_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'X-IG-App-ID': '936619743392459',
  'Content-Type': 'application/x-www-form-urlencoded',
  'Origin': 'https://www.instagram.com',
  'Referer': 'https://www.instagram.com/',
  'Connection': 'keep-alive',
   'Cookie': 'csrftoken=5LR7SseWFdlaf7n7QNWUGLBUNYCVkuBt; sessionid=58220737372%3AjPzXQpUoM50eHY%3A6%3AAYgWIJ2DMbI4z5jFGo3BE_bmbgyO2F0wlhHuSJFd8Q; mid=aIcewwALAAHe6e88HIPPZPw7A9eh; ig_did=A5DD4251-E2A4-429D-A7EE-37177A4301DF', // ✅ CHANGE 3: Optional cookies
};

const MOBILE_HEADERS = {
  'User-Agent': 'Instagram 219.0.0.12.117 Android',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'X-IG-App-ID': '936619743392459',
  'Connection': 'keep-alive',
  'Cookie': 'csrftoken=5LR7SseWFdlaf7n7QNWUGLBUNYCVkuBt; sessionid=58220737372%3AjPzXQpUoM50eHY%3A6%3AAYgWIJ2DMbI4z5jFGo3BE_bmbgyO2F0wlhHuSJFd8Q; mid=aIcewwALAAHe6e88HIPPZPw7A9eh; ig_did=A5DD4251-E2A4-429D-A7EE-37177A4301DF', // ✅ CHANGE 3: Optional cookies
};


axiosRetry(axios, {
  retries: 3,
  retryDelay: (retryCount) => retryCount * 1000, // exponential backoff
  retryCondition: (error) =>
    error.code === 'ECONNRESET' || error.response?.status >= 500,
});

const DOC_ID_USER_MEDIA = '9310670392322965';


async function fetchUserId(username) {
  const url = `${MOBILE_API_BASE}/users/web_profile_info/?username=${username}`;
  const response = await axios.get(url, { headers: MOBILE_HEADERS });
  const user = response?.data?.data?.user;

  if (!user) throw new Error('User not found');
  if (user.is_private) throw new Error('Private account');

  logger.info(`✅ User ID fetched for ${username}`);
  return user.id;
}

/**
 * Fetch reels via GraphQL API
 */
async function fetchReelsGraphQL(userId, username, limit) {
  let allReels = [];
  let after = null;
  let hasNext = true;
  let fetched = 0;
  let attempt = 0;

  while (hasNext && fetched < limit) {
    attempt++;
    const variables = { id: userId, first: Math.min(50, limit - fetched), after };
    const body = new URLSearchParams({
      variables: JSON.stringify(variables),
      doc_id: DOC_ID_USER_MEDIA,
    }).toString();

    const response = await axios.post(GRAPHQL_ENDPOINT, body, { headers: WEB_HEADERS });
    const timeline = response.data?.data?.xdt_api__v1__feed__user_timeline_graphql_connection;

    if (!timeline) throw new Error('GraphQL returned no data');

    const edges = timeline.edges || [];
    const reels = edges
      .filter((edge) => edge.node?.product_type === 'clips')
      .map((edge) => {
        const node = edge.node;
        return {
          id: node.id,
          reel_url: `https://www.instagram.com/reel/${node.code || node.shortcode}/`,
          video_url: node.video_url || node.video_versions?.[0]?.url || null,
          thumbnail_url: node.display_url || node.thumbnail_src || node.image_versions2?.candidates?.[0]?.url || null,
          caption: node.caption?.text || node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
          posted_at: new Date((node.taken_at || node.taken_at_timestamp) * 1000).toUTCString(),
          views: node.play_count || node.video_view_count || null,
          likes: node.like_count || node.edge_liked_by?.count || null,
          comments: node.comment_count || node.edge_media_to_comment?.count || null,
        };
      });

    allReels.push(...reels);
    fetched += reels.length;

    const pageInfo = timeline.page_info || {};
    hasNext = pageInfo.has_next_page && fetched < limit;
    after = pageInfo.end_cursor;

 
    await new Promise((res) => setTimeout(res, 500 * attempt));
  }

  return allReels.slice(0, limit);
}

/**
 * Fallback → Fetch reels via Mobile API feed
 */
async function fetchReelsMobile(userId, username, limit) {
  let reels = [];
  let maxId = null;
  let fetched = 0;
  let attempt = 0;

  while (fetched < limit) {
    attempt++;
    const url = `${MOBILE_API_BASE}/feed/user/${userId}/?count=50${maxId ? `&max_id=${maxId}` : ''}`;
    const response = await axios.get(url, { headers: MOBILE_HEADERS });
    const items = response?.data?.items || [];

    if (!items.length) break;

    const reelItems = items
      .filter((item) => item.product_type === 'clips')
      .map((item) => ({
        id: item.id,
        reel_url: `https://www.instagram.com/reel/${item.code || item.pk}/`,
        video_url: item.video_versions?.[0]?.url || null,
        thumbnail_url: item.image_versions2?.candidates?.[0]?.url || null,
        caption: item.caption?.text || '',
        posted_at: new Date(item.taken_at * 1000).toUTCString(),
        views: item.view_count || item.play_count || null,
        likes: item.like_count || null,
        comments: item.comment_count || null,
      }));

    reels.push(...reelItems);
    fetched += reelItems.length;

    maxId = response.data.next_max_id;
    if (!maxId) break;

    await new Promise((res) => setTimeout(res, 500 * attempt)); // ✅ exponential backoff
  }

  return reels.slice(0, limit);
}

/**
 * Unified fetchReels function
 */
async function fetchReels(username, limit = 30) {
  const userId = await fetchUserId(username);

  try {
    logger.info(`🚀 Trying GraphQL for ${username}`);
    return await fetchReelsGraphQL(userId, username, limit);
  } catch (err) {
    logger.warn(`⚠️ GraphQL failed for ${username}, falling back to Mobile API: ${err.message}`);
    return await fetchReelsMobile(userId, username, limit);
  }
}

module.exports = { fetchReels };
