import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  Route,
  Routes,
  NavLink,
  useNavigate,
  useParams,
} from 'react-router-dom';
import {
  deriveSharedKey,
  deserializeKey,
  encryptMessage,
  decryptMessage,
  generateKeyPair,
  serializeKey,
} from './crypto';

const SERVER_URL = 'http://localhost:4000';

const DEMO_USERS = [
  { id: 'jobseeker', email: 'john.seeker@example.com', name: 'John Seeker', role: 'Job Seeker' },
  { id: 'employer', email: 'hr.employer@example.com', name: 'HR Manager', role: 'Employer' },
];

const JOB_POSTINGS = [
  {
    id: 'job1',
    title: 'React Developer',
    employerId: 'employer',
    employerName: 'Acme Corp',
    summary: 'Build a private chat-enabled job portal interface.',
  },
  {
    id: 'job2',
    title: 'Frontend Engineer',
    employerId: 'employer',
    employerName: 'Nimbus Tech',
    summary: 'Create secure job seeker messaging flows.',
  },
];

const CANDIDATE_PROFILES = [
  {
    id: 'jobseeker',
    name: 'Arjun Kumar',
    title: 'Frontend Developer',
    skills: 'React, Socket.IO, E2EE',
  },
];

function getStoredKeys(userId) {
  const saved = localStorage.getItem(`keys_${userId}`);
  if (saved) {
    return JSON.parse(saved);
  }

  const keyPair = generateKeyPair();
  const result = {
    publicKey: serializeKey(keyPair.publicKey),
    secretKey: serializeKey(keyPair.secretKey),
  };
  localStorage.setItem(`keys_${userId}`, JSON.stringify(result));
  return result;
}

function App() {
  const storedUser = localStorage.getItem('selectedUser');
  const [socket, setSocket] = useState(null);
  const [userId, setUserId] = useState(storedUser || '');
  const [userEmail, setUserEmail] = useState('');
  const [loggedIn, setLoggedIn] = useState(Boolean(storedUser));
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState(loggedIn ? 'Ready' : 'Logged out');
  const listRef = useRef(null);
  const activeChatRef = useRef(null);

  const keys = useMemo(() => getStoredKeys(userId), [userId]);

  useEffect(() => {
    if (loggedIn && userId) {
      const user = DEMO_USERS.find(u => u.id === userId);
      if (user) {
        setUserEmail(user.email);
      }
    }
  }, [loggedIn, userId]);

  useEffect(() => {
    const client = io(SERVER_URL, { transports: ['websocket'] });
    setSocket(client);

    client.on('message_received', message => {
      if (activeChatRef.current?.id !== message.chatId) return;
      setMessages(prev => {
        if (prev.some(msg => msg.id === message.id)) return prev;
        return [...prev, message];
      });
    });

    client.on('chat_updated', () => {
      fetchChats();
    });

    return () => {
      client.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!socket) return;
    fetchChats();
  }, [socket, userId]);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    setActiveChat(null);
    setMessages([]);
  }, [userId]);

  useEffect(() => {
    if (!loggedIn) return;
    localStorage.setItem('selectedUser', userId);
  }, [loggedIn, userId]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  async function fetchChats() {
    try {
      const response = await fetch(`${SERVER_URL}/api/chats/${userId}`);
      const data = await response.json();
      setChats(data);
    } catch (error) {
      console.error(error);
    }
  }

  async function openChat(chat, navigateTo) {
    if (!socket) return;
    const response = await fetch(`${SERVER_URL}/api/chats/${chat.id}/messages`);
    const payload = await response.json();
    socket.emit('join_chat', { chatId: chat.id });
    setActiveChat({ ...chat, otherPublicKey: chat.publicKeys?.[chat.otherUserId] });
    setMessages(payload.map(message => ({ ...message, chatId: chat.id })));
    setDraft('');
    if (navigateTo) {
      navigateTo(`/chat/${chat.id}`);
    }
  }

  function deriveKeyForActiveChat() {
    if (!activeChat?.otherPublicKey) return null;
    try {
      return deriveSharedKey(
        deserializeKey(keys.secretKey),
        deserializeKey(activeChat.otherPublicKey)
      );
    } catch (error) {
      return null;
    }
  }

  const navigate = useNavigate();

  async function startChat(otherUserId, navigateTo) {
    if (!socket || !otherUserId) return;
    setStatus('Starting chat...');
    socket.emit(
      'start_chat',
      {
        fromUserId: userId,
        toUserId: otherUserId,
        publicKey: keys.publicKey,
      },
      chat => {
        if (chat?.error) {
          setStatus('Unable to start chat');
          return;
        }
        setStatus('Chat opened');
        openChat(chat, navigateTo);
      }
    );
  }

  function decryptChatMessage(message) {
    const sharedKey = deriveKeyForActiveChat();
    if (!sharedKey) return '[waiting for recipient key]';
    const text = decryptMessage(sharedKey, message.encryptedPayload);
    return text || '[cannot decrypt]';
  }

  function getInboxLabel(otherId) {
    const user = DEMO_USERS.find(u => u.id === otherId);
    return user ? `${user.name} (${user.role})` : otherId;
  }

  async function sendMessage() {
    if (!activeChat || !draft.trim() || !socket) return;
    const sharedKey = deriveKeyForActiveChat();
    if (!sharedKey) {
      setStatus('Unable to encrypt message until key is available');
      return;
    }

    const encryptedPayload = encryptMessage(sharedKey, draft.trim());
    const payload = {
      chatId: activeChat.id,
      senderId: userId,
      encryptedPayload,
    };

    socket.emit('send_message', payload, result => {
      if (result?.error) {
        setStatus('Message send failed');
        return;
      }
      setMessages(prev => [...prev, { ...payload, timestamp: new Date().toISOString() }]);
      setDraft('');
      setStatus('Message sent');
    });
  }

  function handleLogin(selectedUserId) {
    localStorage.setItem('selectedUser', selectedUserId);
    setUserId(selectedUserId);
    setLoggedIn(true);
    setStatus('Logged in');
  }

  function handleLogout() {
    localStorage.removeItem('selectedUser');
    setUserId('');
    setUserEmail('');
    setLoggedIn(false);
    setStatus('Logged out');
    setActiveChat(null);
    setMessages([]);
  }

  if (!loggedIn) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1>💼 Job Portal Chat</h1>
            <p>Secure encrypted messaging for job seekers and employers</p>
          </div>

          <div className="login-content">
            <h2>Select your account</h2>
            <div className="user-buttons">
              {DEMO_USERS.map(user => (
                <button
                  key={user.id}
                  className="user-login-btn"
                  onClick={() => handleLogin(user.id)}
                >
                  <div className="user-avatar">{user.name.charAt(0)}</div>
                  <div className="user-info">
                    <div className="user-name">{user.name}</div>
                    <div className="user-role">{user.role}</div>
                    <div className="user-email">{user.email}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="login-footer">
            <p>🔒 End-to-end encrypted messaging</p>
          </div>
        </div>
      </div>
    );
  }

  const currentUser = DEMO_USERS.find(u => u.id === userId);

  return (
    <div className="chat-shell">
      <aside className="inbox-panel">
        <div className="sidebar-header">
          <h2>💬 Messages</h2>
          <div className="user-profile-card">
            <div className="profile-avatar">{currentUser?.name.charAt(0)}</div>
            <div className="profile-info">
              <div className="profile-name">{currentUser?.name}</div>
              <div className="profile-email">{userEmail}</div>
            </div>
            <button className="logout-btn" onClick={handleLogout} title="Logout">
              ⎋
            </button>
          </div>
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <NavLink
            to="/inbox"
            className={({ isActive }) => (isActive ? 'primary nav-link-active' : 'secondary')}
          >
            📬 Inbox
          </NavLink>
          {userId === 'jobseeker' && (
            <NavLink
              to="/jobs"
              className={({ isActive }) => (isActive ? 'primary nav-link-active' : 'secondary')}
            >
              💼 Jobs
            </NavLink>
          )}
          {userId === 'employer' && (
            <NavLink
              to="/profiles"
              className={({ isActive }) => (isActive ? 'primary nav-link-active' : 'secondary')}
            >
              👥 Profiles
            </NavLink>
          )}
        </div>

        <div style={{ marginTop: 24 }}>
          <Routes>
            <Route
              path="/"
              element={<InboxList chats={chats} getInboxLabel={getInboxLabel} onOpen={chat => openChat(chat, navigate)} />}
            />
            <Route
              path="/inbox"
              element={<InboxList chats={chats} getInboxLabel={getInboxLabel} onOpen={chat => openChat(chat, navigate)} />}
            />
            <Route
              path="/jobs"
              element={<JobList jobs={JOB_POSTINGS} onStart={job => startChat(job.employerId, navigate)} />}
            />
            <Route
              path="/profiles"
              element={<ProfileList profiles={CANDIDATE_PROFILES} onStart={profile => startChat(profile.id, navigate)} />}
            />
            <Route
              path="/chat/:chatId"
              element={<InboxList chats={chats} getInboxLabel={getInboxLabel} onOpen={chat => openChat(chat, navigate)} />}
            />
          </Routes>
        </div>
      </aside>

      <section className="chat-panel">
        <div className="chat-header">
          <div className="chat-title">
            <strong>Active chat:</strong>{' '}
            {activeChat ? getInboxLabel(activeChat.otherUserId) : '📭 No active chat'}
          </div>
          <div className="chat-status">{status}</div>
        </div>

        <Routes>
          <Route
            path="/chat/:chatId"
            element={
              <ChatPanel
                chats={chats}
                activeChat={activeChat}
                messages={messages}
                draft={draft}
                setDraft={setDraft}
                listRef={listRef}
                decryptChatMessage={decryptChatMessage}
                sendMessage={sendMessage}
                openChat={openChat}
                getInboxLabel={getInboxLabel}
                userId={userId}
              />
            }
          />
          <Route
            path="*"
            element={
              <div className="empty-state">
                <div className="empty-icon">💬</div>
                <h3>No chat selected</h3>
                <p>Select a conversation from the inbox or start a new one to begin messaging.</p>
              </div>
            }
          />
        </Routes>
      </section>
    </div>
  );
}

function InboxList({ chats, getInboxLabel, onOpen }) {
  return (
    <div>
      <h3>Inbox</h3>
      {chats.length === 0 && <p>No chats yet.</p>}
      {chats.map(chat => (
        <div
          key={chat.id}
          className="chat-list-item"
          onClick={() => onOpen(chat)}
          style={{ cursor: 'pointer' }}
        >
          <strong>{getInboxLabel(chat.otherUserId)}</strong>
          <div style={{ marginTop: 8, color: '#475569' }}>
            {chat.lastMessage
              ? `${chat.lastMessage.senderId} · ${new Date(chat.lastMessage.timestamp).toLocaleTimeString()}`
              : 'No messages yet'}
          </div>
        </div>
      ))}
    </div>
  );
}

function JobList({ jobs, onStart }) {
  return (
    <div>
      <h3>Job Listings</h3>
      {jobs.map(job => (
        <div key={job.id} style={{ marginBottom: 18 }}>
          <div style={{ fontWeight: 600 }}>{job.title}</div>
          <div style={{ fontSize: 13, color: '#475569' }}>{job.summary}</div>
          <button className="secondary" style={{ marginTop: 8 }} onClick={() => onStart(job)}>
            Message {job.employerName}
          </button>
        </div>
      ))}
    </div>
  );
}

function ProfileList({ profiles, onStart }) {
  return (
    <div>
      <h3>Candidate Profiles</h3>
      {profiles.map(profile => (
        <div key={profile.id} style={{ marginBottom: 18 }}>
          <div style={{ fontWeight: 600 }}>{profile.name}</div>
          <div style={{ fontSize: 13, color: '#475569' }}>{profile.title}</div>
          <div style={{ fontSize: 13, color: '#475569' }}>Skills: {profile.skills}</div>
          <button className="secondary" style={{ marginTop: 8 }} onClick={() => onStart(profile)}>
            Message candidate
          </button>
        </div>
      ))}
    </div>
  );
}

function ChatPanel({
  chats,
  activeChat,
  messages,
  draft,
  setDraft,
  listRef,
  decryptChatMessage,
  sendMessage,
  openChat,
  getInboxLabel,
  userId,
}) {
  const { chatId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!chatId || activeChat?.id === chatId) return;
    const chat = chats.find(item => item.id === chatId);
    if (chat) {
      openChat(chat, navigate);
    }
  }, [chatId, activeChat, chats, openChat, navigate]);

  if (!activeChat || activeChat.id !== chatId) {
    return (
      <div style={{ padding: 20, background: '#f8fafc', borderRadius: 18 }}>
        <p>Loading chat...</p>
      </div>
    );
  }

  return (
    <>
      <div className="chat-messages" ref={listRef}>
        {messages.map(message => (
          <div
            key={message.id}
            className={`chat-message ${message.senderId === userId ? 'self' : ''}`}
          >
            <div className={`chat-bubble ${message.senderId === userId ? '' : 'other'}`}>
              {decryptChatMessage(message)}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
              {message.senderId} · {new Date(message.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <textarea
          rows="4"
          placeholder="Type a private message..."
          value={draft}
          onChange={e => setDraft(e.target.value)}
        />
        <div className="message-actions">
          <button className="primary" onClick={sendMessage}>
            Send encrypted message
          </button>
        </div>
      </div>
    </>
  );
}

export default App;
