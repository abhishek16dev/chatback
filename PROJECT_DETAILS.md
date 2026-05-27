# Career Connect Secure Chat Prototype

## Overview

This project is a secure chat prototype built for a hiring/job portal workflow. It blends a role-aware job seeker and employer experience with encrypted private messaging, designed to simulate a real recruitment conversation. The goal is to demonstrate how secure messaging can be integrated into a hiring portal without exposing plaintext chat content on the server.

## What this project uses

### Frontend
- `React` is used to build dynamic, component-based UI views for the inbox, jobs, profiles, and chat screens.
  It allows the app to maintain chat state, update in real time, and re-render only the pieces of UI that change. React also simplifies the conditional rendering of authenticated and unauthenticated flows.
- `Vite` provides a very fast development server, hot module replacement, and optimized bundling.
  This makes local development snappy and keeps refresh times low when editing the frontend code.
- `react-router-dom` handles navigation between pages such as `/inbox`, `/jobs`, `/profiles`, and `/chat/:chatId`.
  The router keeps the app feeling like a multi-page interface while staying single-page under the hood.
- `Framer Motion` adds polished animation for card hover effects, route transitions, and UI feedback.
  It makes the experience feel smoother without adding heavy animation code.
- `Socket.IO Client` creates a realtime connection to the backend, allowing chat events to arrive instantly.
  It is used for joining chat rooms, receiving new messages, and reacting to updates from the other participant.
- `Tailwind CSS` provides utility classes for styling, spacing, and responsive layout.
  It keeps the UI consistent and lets the project avoid large amounts of custom CSS.
- `tweetnacl` (via `frontend/src/crypto.js`) handles the cryptographic operations used for public-key exchange and local message encryption.
  These primitives are small, fast, and designed for secure client-side encryption flows.

### Backend
- `Express` is the web framework that handles API routes such as login, register, refresh, logout, and chat retrieval.
  It also manages request payload parsing and middleware like CORS and cookie parsing.
- `Socket.IO` on the backend supports realtime bidirectional chat events and room-based message delivery.
  It is what enables instant chat updates without polling.
- `jsonwebtoken` generates and validates JWT access tokens for authenticated API calls.
  Access tokens allow the frontend to prove identity when calling protected endpoints and establishing sockets.
- `cookie-parser` reads refresh tokens from HTTP cookies.
  The refresh token route uses this cookie to issue a new access token without forcing the user to log back in.
- `bcryptjs` hashes user passwords before storage.
  This creates a minimal password protection system for the demo, even though the storage is still just a JSON file.
- Local JSON storage (`backend/data.json`) holds users, chat records, and encrypted messages for the demo.
  It simulates persistence so the prototype can remember state between backend restarts.

## Why these packages were used

- `React` + `Vite` were chosen because they deliver a modern frontend developer experience with minimal configuration.
  React is excellent for managing interactive state, and Vite makes local iteration fast so the app can be refined quickly.
- `Socket.IO` was chosen because it removes the complexity of websocket connection handling and simplifies room-based message broadcasting.
  It works well for chat applications and lets the backend push updates to both participants immediately.
- `Express` is a lightweight and familiar backend framework for building REST APIs.
  It makes the auth routes and JSON payload handling easy to implement and easy to extend.
- `jsonwebtoken` supports stateless session validation for API requests, which is simpler than managing session stores in a demo app.
  It also allows the socket connection to authenticate using the same token mechanism.
- `bcryptjs` secures user passwords with hashing, which is a must for any login functionality.
  Even in a demo, this avoids storing plaintext passwords and models proper password handling.
- `tweetnacl` is a reputable crypto library with a small API surface.
  It gives the project secure key generation, shared-secret creation, and message encryption without needing a large cryptography stack.
- `Tailwind CSS` keeps the UI styling consistent and maintainable.
  It reduces the need for custom class names and allows the design to stay visually coherent across components.

## How it works

### Authentication
1. The user registers or logs in through the frontend form, entering email, password, and the selected role.
2. The frontend sends credentials and the user public key to the backend auth endpoint.
3. The backend validates the password, stores the public key, and issues a JWT access token plus a refresh token.
4. The frontend stores the access token client-side and uses the refresh token cookie to maintain the session.
5. This allows the user to stay logged in while preserving a secure socket connection.

### Realtime chat setup
1. The authenticated client opens a Socket.IO connection and sends the access token for authentication.
2. When the user requests a new chat, the frontend emits `start_chat` with the recipient ID and the sender public key.
3. The backend calls `getOrCreateChat()` to build or retrieve a normalized chat room ID based on both user IDs.
4. The chat record stores public keys in a metadata object so each participant’s key is available for shared-secret derivation.
5. The backend responds with a chat summary and the room is opened in the UI so the conversation can start.

### Message encryption flow
1. Before sending text, the frontend derives a shared secret using the sender’s private key and the recipient’s public key.
   This shared secret is used to encrypt messages so only the recipient can decrypt them.
2. The plaintext message is encrypted locally in the browser using `encryptMessage()`.
   The server never sees the unencrypted content, only the ciphertext.
3. The encrypted payload is sent to the backend via the `send_message` event.
4. The backend stores only ciphertext in the chat record and broadcasts the payload to the other participant.
5. The receiving browser derives the same shared secret and decrypts the ciphertext locally with `decryptMessage()`.
   This is the essence of end-to-end encryption in the app.

## Project logic and key libraries

### `frontend/src/crypto.js`
- `generateKeyPair()` returns a curve25519 public/private key pair for the user.
  It ensures each user has a unique cryptographic identity in the browser.
- `serializeKey()` and `deserializeKey()` convert binary keys to string form and back.
  This is important because keys need to be stored in localStorage and sent over JSON.
- `deriveSharedKey()` uses the user’s secret key and the other user’s public key to derive a symmetric shared key.
  Both participants derive the same key independently, allowing encrypted messages to be opened only by the intended recipient.
- `encryptMessage()` and `decryptMessage()` perform the actual payload encryption and decryption.
  The frontend only sends ciphertext to the backend, preserving the privacy of chat content.

### `backend/server.js`
- Handles authentication routes: `login`, `register`, `refresh`, and `logout`.
  Each route validates input, issues tokens, and stores refresh tokens securely in cookies.
- Stores refresh tokens and verifies access tokens for protected `GET /api/chats` and message routes.
  This ensures only authenticated users can fetch chats or join chat rooms.
- Manages Socket.IO events for the chat lifecycle:
  - `start_chat` creates or retrieves a chat room and stores public key metadata.
  - `join_chat` subscribes the socket to the room and tracks message delivery.
  - `send_message` records encrypted messages and broadcasts them.
  - `delete_message` allows senders to remove their messages.
  - Read and delivery events update chat state in realtime.
- The backend keeps chat summaries and participant metadata in `backend/dataStore.js`.
  This allows the frontend to fetch a lightweight inbox view without loading entire message histories.

### `backend/dataStore.js`
- Provides a lightweight persistence layer over `backend/data.json`.
  It implements helper functions for retrieving users, chats, and messages.
- Normalizes chat IDs by sorting user IDs so each 1:1 conversation has a stable, repeatable room identifier.
  This prevents duplicate rooms when the same two users start another chat.
- Stores users, chat metadata, public keys, and encrypted messages in one JSON data structure.
  The file is written to disk on changes, so the demo state persists across backend restarts.
- Uses a debounced write mechanism to batch disk updates.
  This avoids frequent writes while still saving state reliably.

## Files and their meaning

### Root files
- `README.md`: contains the main setup guide, quick start instructions, and a concise project overview.
  It is the first document a developer should read when opening the repository.
- `PROJECT_DETAILS.md`: this document, which provides a deeper explanation of how the system works.
  It includes architecture notes, package reasoning, and file-level responsibilities.

### Backend files
- `backend/server.js`: the backend application entry point and the central chat/event handler.
  It wires Express routes, Socket.IO authentication, and chat event logic.
- `backend/dataStore.js`: a simple storage abstraction over `backend/data.json`.
  It implements user lookup, chat creation, message persistence, and data updates.
- `backend/data.json`: the demo database file containing seeded users, chats, and messages.
  It acts as the current app state for demo purposes.
- `backend/package.json`: backend dependency list and npm scripts.
  It defines the libraries required to run the server.

### Frontend files
- `frontend/src/App.jsx`: the main React app file and interface for chat, auth, jobs, and profiles.
  It manages socket events, state transitions, navigation, and UI rendering.
- `frontend/src/crypto.js`: encryption utilities and shared secret logic.
  It encapsulates the E2EE operations used across the chat flow.
- `frontend/src/main.jsx`: bootstraps the React application and attaches it to the DOM.
  It also loads global CSS and router configuration.
- `frontend/src/style.css`: global styles, theme settings, and Tailwind directives.
  It defines the overall page background, typography, and utility styling.
- `frontend/package.json`: frontend dependency list and npm scripts.
  It includes packages needed to run and build the client.
- `frontend/vite.config.js`: configuration for Vite’s development server and build settings.
  It can contain port settings and plugins specific to the frontend.
- `frontend/tailwind.config.js`: Tailwind configuration for theme tokens and content scanning.
  It controls which files Tailwind scans to generate CSS.
- `frontend/postcss.config.js`: PostCSS plugin setup, typically needed for Tailwind processing.
  It ensures Tailwind directives are compiled correctly.

## User workflow

- A Job Seeker logs in or registers using the provided email and password fields.
  Once authenticated, they can browse jobs or open the inbox to view prior secure conversations.
- The Job Seeker taps `Start secure chat` on a job card, which triggers chat creation with the employer.
  The employer is identified by a shared `employerId`, and the app creates a deterministic room for the pair.
- The app opens a private encrypted room and fetches the encrypted chat history from the server.
  Messages sent in that room are encrypted before transit and only decrypted in the browser.
- The employer receives the encrypted message through Socket.IO and decrypts it when the chat is open.
  This keeps the server from ever seeing the plaintext message content.
- Both participants can continue the conversation with realtime delivery, delete messages, and mark chats as read.
  The interface updates automatically as new events arrive.

## Why this matters 

- The app is a prototype of secure hiring communication, showing how private chat can be embedded into recruitment workflows.
  It demonstrates the idea of offering encrypted candidate-employer conversation without leaking chat text to the server.
- It keeps plaintext messages out of the server by encrypting them in the browser before sending.
  This models an end-to-end encrypted experience even though the app uses a simple demo backend.
- It uses deterministic chat IDs so both users share one room record and the chat can be reopened reliably.
  This simplifies room lookup and prevents duplicate conversations between the same two users.
- It demonstrates how to layer realtime messaging over encrypted transport, combining authentication, sockets, and client-side crypto.
  That architecture is useful for building secure collaboration or chat products in the future.

## Notes for improvement

- Add HTTPS and production-ready security to protect tokens, cookies, and socket traffic.
  Real deployments should also use a proper database instead of local JSON storage.
- Replace JSON storage with a real database like PostgreSQL, MongoDB, or DynamoDB.
  This provides durability, indexing, and scaling for real user data.
- Add stronger key management and persistence so user keypairs survive across devices securely.
  That would support a true end-to-end encrypted experience beyond a browser-only demo.
- Improve user authentication and authorization with real role-based access controls.
  The app should prevent unauthorized users from reading chat metadata or joining rooms.
- Add message timestamps, typing indicators, and delivery receipts to improve the chat UX.
  These features make the conversation feel more complete and useful.
- Harden the encryption flow with proper key exchange records, forward secrecy, and verification.
  Production E2EE systems require more rigorous cryptographic design than a demo prototype.
