// Only an explicit photo change changes its priority. Publishing unrelated
// resources must not make an old Creator photo override a newer profile photo.
function stampCreatorPhotos(resources, previous, updatedAt) {
  const oldCreators = new Map((previous && previous.creators || []).map((creator) => [creator.id, creator]));
  return {
    ...resources,
    creators: resources.creators.map((creator) => {
      const old = oldCreators.get(creator.id);
      const result = { ...creator };
      delete result.photoUpdatedAt;
      if (!old || old.photoUrl !== creator.photoUrl) result.photoUpdatedAt = updatedAt;
      else if (old.photoUpdatedAt) result.photoUpdatedAt = old.photoUpdatedAt;
      return result;
    }),
  };
}

function creatorWithProfilePhoto(creator, profile) {
  if (!profile || !profile.photoUrl) return creator;
  const profileTime = Date.parse(profile.photoUpdatedAt) || 0;
  const creatorTime = Date.parse(creator.photoUpdatedAt) || 0;
  const bundled = !creator.photoUrl || creator.photoUrl === "/favicon.svg" || String(creator.photoUrl).startsWith("/images/");
  // Legacy profiles have no photo timestamp: retain existing explicit Creator
  // photos until the owner next saves their profile picture.
  if (profileTime > creatorTime || (!profileTime && !creatorTime && bundled)) {
    return { ...creator, photoUrl: profile.photoUrl, ...(profileTime ? { photoUpdatedAt: profile.photoUpdatedAt } : {}) };
  }
  return creator;
}

module.exports = { stampCreatorPhotos, creatorWithProfilePhoto };
