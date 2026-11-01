/** Painted panels live in the frontend's public folder: /stories/<siteId>/1.jpg … */
export const artPaths = (siteId: string, count = 4) => Array.from({ length: count }, (_, i) => `/stories/${siteId}/${i + 1}.jpg`);
