# Cali anonymous

Static app with Firebase as the backend. No build step, no Node app code, and no Firebase Hosting requirement.

## Firebase setup

1. Create a Firebase web app.
2. Enable Anonymous Authentication in Firebase Console.
3. Create a Firestore database.
4. Copy your web config into `firebase.js`.
5. Publish the rules in `firestore.rules`.
6. Deploy `index.html`, `styles.css`, `app.js`, and `firebase.js` to your static host.

If your host uses a custom domain, add that domain in Firebase Console under Authentication allowed domains.

## Data

- `posts`: post text, mood, category, likes, comment count, and compressed base64 image.
- `comments`: separate comment documents linked by `postId`.

Images are compressed in the browser before upload and capped around 850 KB as base64 so each post document stays under Firestore's document size limit.
