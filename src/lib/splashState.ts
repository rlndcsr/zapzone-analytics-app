// Tracks whether the animated splash has already played during this app launch.
let played = false;

export const hasPlayedSplash = () => played;

export const markSplashPlayed = () => {
  played = true;
};
