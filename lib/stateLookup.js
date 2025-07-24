const stateBounds = [
  { abbr:'AL', minLat:30, maxLat:35.1, minLon:-88.6, maxLon:-84.8 },
  { abbr:'AK', minLat:54.8, maxLat:71.5, minLon:-170, maxLon:-129.9 },
  { abbr:'AZ', minLat:31.3, maxLat:37, minLon:-114.8, maxLon:-109 },
  { abbr:'AR', minLat:33, maxLat:36.5, minLon:-94.6, maxLon:-89.6 },
  { abbr:'CA', minLat:32.5, maxLat:42, minLon:-124.6, maxLon:-114.1 },
  { abbr:'CO', minLat:37, maxLat:41.1, minLon:-109.1, maxLon:-102 },
  { abbr:'CT', minLat:40.9, maxLat:42.1, minLon:-73.7, maxLon:-71.8 },
  { abbr:'DE', minLat:38.4, maxLat:39.9, minLon:-75.8, maxLon:-75 },
  { abbr:'FL', minLat:24.4, maxLat:31, minLon:-87.6, maxLon:-80 },
  { abbr:'GA', minLat:30.4, maxLat:35.1, minLon:-85.6, maxLon:-80.8 },
  { abbr:'HI', minLat:18.9, maxLat:22.4, minLon:-160.3, maxLon:-154.7 },
  { abbr:'ID', minLat:42, maxLat:49.1, minLon:-117.2, maxLon:-111 },
  { abbr:'IL', minLat:36.9, maxLat:42.5, minLon:-91.5, maxLon:-87 },
  { abbr:'IN', minLat:37.8, maxLat:41.8, minLon:-88.1, maxLon:-84.8 },
  { abbr:'IA', minLat:40.4, maxLat:43.5, minLon:-96.6, maxLon:-90.1 },
  { abbr:'KS', minLat:37, maxLat:40.1, minLon:-102.1, maxLon:-94.6 },
  { abbr:'KY', minLat:36.5, maxLat:39.2, minLon:-89.6, maxLon:-82 },
  { abbr:'LA', minLat:28.9, maxLat:33.1, minLon:-94.1, maxLon:-88.8 },
  { abbr:'ME', minLat:42.9, maxLat:47.5, minLon:-71.1, maxLon:-66.9 },
  { abbr:'MD', minLat:37.9, maxLat:39.7, minLon:-79.5, maxLon:-75 },
  { abbr:'MA', minLat:41.2, maxLat:42.9, minLon:-73.5, maxLon:-69.9 },
  { abbr:'MI', minLat:41.7, maxLat:48.3, minLon:-90.4, maxLon:-82.4 },
  { abbr:'MN', minLat:43.5, maxLat:49.4, minLon:-97.2, maxLon:-89.5 },
  { abbr:'MS', minLat:30.2, maxLat:35, minLon:-91.7, maxLon:-88.1 },
  { abbr:'MO', minLat:36, maxLat:40.6, minLon:-95.7, maxLon:-89.1 },
  { abbr:'MT', minLat:44.4, maxLat:49.1, minLon:-116.1, maxLon:-104 },
  { abbr:'NE', minLat:40, maxLat:43.1, minLon:-104.1, maxLon:-95.3 },
  { abbr:'NV', minLat:35, maxLat:42, minLon:-120, maxLon:-114 },
  { abbr:'NH', minLat:42.7, maxLat:45.3, minLon:-72.6, maxLon:-70.6 },
  { abbr:'NJ', minLat:38.9, maxLat:41.4, minLon:-75.6, maxLon:-73.9 },
  { abbr:'NM', minLat:31.3, maxLat:37, minLon:-109.1, maxLon:-103 },
  { abbr:'NY', minLat:40.5, maxLat:45.3, minLon:-79.8, maxLon:-71.8 },
  { abbr:'NC', minLat:33.8, maxLat:36.6, minLon:-84.3, maxLon:-75.4 },
  { abbr:'ND', minLat:45.9, maxLat:49.1, minLon:-104.1, maxLon:-96.4 },
  { abbr:'OH', minLat:38.4, maxLat:41.9, minLon:-84.8, maxLon:-80.5 },
  { abbr:'OK', minLat:33.6, maxLat:37.1, minLon:-103.1, maxLon:-94.4 },
  { abbr:'OR', minLat:42, maxLat:46.3, minLon:-124.6, maxLon:-116.5 },
  { abbr:'PA', minLat:39.7, maxLat:42.5, minLon:-80.5, maxLon:-74.7 },
  { abbr:'RI', minLat:41, maxLat:42.1, minLon:-71.9, maxLon:-71.1 },
  { abbr:'SC', minLat:32.1, maxLat:35.2, minLon:-83.4, maxLon:-78.5 },
  { abbr:'SD', minLat:42.5, maxLat:45.9, minLon:-104.1, maxLon:-96.4 },
  { abbr:'TN', minLat:35, maxLat:36.7, minLon:-90.3, maxLon:-81.6 },
  { abbr:'TX', minLat:25.8, maxLat:36.5, minLon:-106.7, maxLon:-93.5 },
  { abbr:'UT', minLat:37, maxLat:42.1, minLon:-114.1, maxLon:-109 },
  { abbr:'VT', minLat:42.7, maxLat:45.1, minLon:-73.4, maxLon:-71.5 },
  { abbr:'VA', minLat:36.5, maxLat:39.5, minLon:-83.7, maxLon:-75.2 },
  { abbr:'WA', minLat:45.5, maxLat:49.1, minLon:-124.8, maxLon:-116.9 },
  { abbr:'WV', minLat:37.1, maxLat:40.6, minLon:-82.7, maxLon:-77.7 },
  { abbr:'WI', minLat:42.5, maxLat:47.3, minLon:-92.9, maxLon:-86.2 },
  { abbr:'WY', minLat:41, maxLat:45.1, minLon:-111.1, maxLon:-104 },
  { abbr:'DC', minLat:38.8, maxLat:38.95, minLon:-77.12, maxLon:-76.9 }
];

function getStateFromCoordinates(lat, lon) {
  for (const s of stateBounds) {
    if (lat >= s.minLat && lat <= s.maxLat && lon >= s.minLon && lon <= s.maxLon) {
      return s.abbr;
    }
  }
  return null;
}

module.exports = getStateFromCoordinates;
