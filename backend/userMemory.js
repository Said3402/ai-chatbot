const profiles = new Map();

function getProfile(sessionId) {
  if (!profiles.has(sessionId)) {
    profiles.set(sessionId, {
      name: null,
      language: null
    });
  }
  return profiles.get(sessionId);
}

function setName(sessionId, name) {
  const profile = getProfile(sessionId);
  profile.name = name;
}

function setLanguage(sessionId, language) {
  const profile = getProfile(sessionId);
  profile.language = language;
}

module.exports = {
  getProfile,
  setName,
  setLanguage
};
