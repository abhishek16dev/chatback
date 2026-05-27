import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { motion } from 'framer-motion';
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

const APP_NAME = 'Career Connect';
const APP_TAGLINE = 'Effortless, encrypted recruiter-candidate messaging for modern hiring.';
const AUTH_DESCRIPTION = 'Sign in as a candidate or hiring manager, then start private encrypted conversations with role-aware workflow.';

const JOB_POSTINGS = [
  {
    id: 'job1',
    title: 'React Developer',
    employerId: 'employer',
    employerName: 'Acme Corp',
    location: 'Remote',
    summary: 'Build a private chat-enabled job portal interface with modern React UX.',
    tags: ['React', 'Web3', 'Remote'],
  },
  {
    id: 'job2',
    title: 'Frontend Engineer',
    employerId: 'employer',
    employerName: 'Nimbus Tech',
    location: 'New York, NY',
    summary: 'Create secure job seeker messaging flows for a fast-growing hiring platform.',
    tags: ['React', 'TypeScript', 'Design systems'],
  },
  {
    id: 'job3',
    title: 'UI/UX Developer',
    employerId: 'employer',
    employerName: 'Luna Labs',
    location: 'San Francisco, CA',
    summary: 'Design intuitive chat experiences for job seekers and recruiters.',
    tags: ['UI', 'UX', 'Figma'],
  },
  {
    id: 'job4',
    title: 'Product Designer',
    employerId: 'employer',
    employerName: 'Vertex Solutions',
    location: 'Austin, TX',
    summary: 'Work with teams to polish hiring workflows and private candidate conversations.',
    tags: ['Product', 'Design', 'Collaboration'],
  },
  {
    id: 'job5',
    title: 'Full Stack Developer',
    employerId: 'employer',
    employerName: 'Orbit Innovations',
    location: 'Chicago, IL',
    summary: 'Build secure backend APIs and real-time chat experiences for recruitment products.',
    tags: ['Node.js', 'Socket.IO', 'APIs'],
  },
  {
    id: 'job6',
    title: 'Talent Acquisition Specialist',
    employerId: 'employer',
    employerName: 'Horizon Recruiters',
    location: 'Remote',
    summary: 'Lead candidate outreach and start private conversations with job seekers.',
    tags: ['Recruiting', 'HR', 'Communication'],
  },
  {
    id: 'job7',
    title: 'Customer Success Manager',
    employerId: 'employer',
    employerName: 'Beacon Works',
    location: 'Boston, MA',
    summary: 'Manage relationships and onboard talent using secure messaging channels.',
    tags: ['Customer Success', 'Onboarding', 'Support'],
  },
  {
    id: 'job8',
    title: 'Technical Recruiter',
    employerId: 'employer',
    employerName: 'Pulse Talent',
    location: 'Seattle, WA',
    summary: 'Source candidates and initiate private chat sessions from their profile pages.',
    tags: ['Recruiting', 'Technical', 'Sourcing'],
  },
];

const CANDIDATE_PROFILES = [
  {
    id: 'jobseeker',
    name: 'Arjun Kumar',
    title: 'Frontend Developer',
    skills: 'React, Socket.IO, E2EE',
    bio: 'Experienced in building secure communication interfaces for digital hiring.',
  },
  {
    id: 'candidate2',
    name: 'Priya Sharma',
    title: 'UX Designer',
    skills: 'Figma, Research, Interaction Design',
    bio: 'Working with teams to create seamless candidate engagement experiences.',
  },
  {
    id: 'candidate3',
    name: 'Carlos Mendes',
    title: 'Backend Engineer',
    skills: 'Node.js, Socket.IO, API design',
    bio: 'Building robust platforms for private recruiter/candidate conversations.',
  },
];

const INITIAL_FORM = { email: '', password: '' };
const INITIAL_REGISTER = { name: '', email: '', password: '', role: 'Job Seeker' };
const USER_ROLES = ['Job Seeker', 'Employer'];

function getStoredKeys(userId) {
  if (!userId) return null;
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

function getUserIdFromEmail(email) {
  if (!email) return '';
  return email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '_') || `user_${Date.now()}`;
}

function getStoredUser() {
  const raw = localStorage.getItem('selectedUser');
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') {
      const user = DEMO_USERS.find(item => item.id === parsed) || null;
      if (user) {
        localStorage.setItem('selectedUser', JSON.stringify(user));
      }
      return user;
    }

    if (parsed && parsed.id) {
      // Normalize old plain JSON object or object-like data.
      localStorage.setItem('selectedUser', JSON.stringify(parsed));
      return parsed;
    }
  } catch (error) {
    const user = DEMO_USERS.find(item => item.id === raw) || null;
    if (user) {
      localStorage.setItem('selectedUser', JSON.stringify(user));
    }
    return user;
  }

  return null;
}

function getStoredToken() {
  return localStorage.getItem('accessToken') || '';
}

function setStoredSession(user, accessToken) {
  localStorage.setItem('selectedUser', JSON.stringify(user));
  localStorage.setItem('accessToken', accessToken);
}

function clearStoredSession() {
  localStorage.removeItem('selectedUser');
  localStorage.removeItem('accessToken');
}

function App() {
  const storedUser = getStoredUser();
  const storedToken = getStoredToken();

  const [socket, setSocket] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [user, setUser] = useState(storedUser);
  const [accessToken, setAccessToken] = useState(storedToken);
  const [authMode, setAuthMode] = useState('login');
  const [loginForm, setLoginForm] = useState(INITIAL_FORM);
  const [registerForm, setRegisterForm] = useState(INITIAL_REGISTER);
  const [showPassword, setShowPassword] = useState(false);
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState(user ? 'Ready' : 'Logged out');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const activeChatRef = useRef(null);

  const keys = useMemo(() => getStoredKeys(user?.id), [user?.id]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!accessToken) {
      refreshToken();
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    const client = io(SERVER_URL, {
      transports: ['websocket'],
      auth: { token: accessToken },
    });

    setSocket(client);
    setSocketConnected(false);

    client.on('connect', () => {
      setSocketConnected(true);
      setStatus('Secure socket connected');
    });

    client.on('disconnect', () => {
      setSocketConnected(false);
      setStatus('Socket disconnected');
    });

    client.on('connect_error', err => {
      setSocketConnected(false);
      setStatus('Socket auth failed');
      console.error('Socket auth error', err.message);
    });

    client.on('message_received', message => {
      if (activeChatRef.current?.id !== message.chatId) return;
      setMessages(prev => (prev.some(msg => msg.id === message.id) ? prev : [...prev, message]));
    });

    client.on('message_read', ({ chatId, userId }) => {
      if (activeChatRef.current?.id !== chatId) return;
      setMessages(prev => prev.map(msg => {
        const existingReadBy = Array.isArray(msg.readBy) ? msg.readBy : [msg.senderId];
        if (existingReadBy.includes(userId)) {
          return msg;
        }
        return { ...msg, readBy: [...existingReadBy, userId] };
      }));
    });

    client.on('message_delivered', ({ chatId, messageId, userId }) => {
      if (activeChatRef.current?.id !== chatId) return;
      setMessages(prev => prev.map(msg => {
        if (msg.id !== messageId) return msg;
        const existingDeliveredBy = Array.isArray(msg.deliveredBy) ? msg.deliveredBy : [msg.senderId];
        if (existingDeliveredBy.includes(userId)) {
          return msg;
        }
        return { ...msg, deliveredBy: [...existingDeliveredBy, userId] };
      }));
    });

    client.on('message_deleted', ({ chatId, messageId }) => {
      if (activeChatRef.current?.id !== chatId) return;
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
    });

    client.on('chat_updated', () => {
      fetchChats();
    });

    return () => {
      client.disconnect();
    };
  }, [accessToken]);

  useEffect(() => {
    if (!socket || chats.length === 0) return;
    chats.forEach(chat => {
      socket.emit('join_chat', { chatId: chat.id });
    });
  }, [socket, chats]);

  useEffect(() => {
    if (accessToken && user) {
      fetchChats();
    }
  }, [accessToken, user]);

  useEffect(() => {
    if (messages.length && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  async function authFetch(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(url, {
      credentials: 'include',
      ...options,
      headers,
    });

    if (response.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) {
        return authFetch(url, options);
      }
    }

    return response;
  }

  async function refreshToken() {
    try {
      const response = await fetch(`${SERVER_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        handleLogout();
        return false;
      }
      const data = await response.json();
      setAccessToken(data.accessToken);
      setUser(data.user);
      setStoredSession(data.user, data.accessToken);
      setStatus('Ready');
      return true;
    } catch (err) {
      console.error(err);
      handleLogout();
      return false;
    }
  }

  async function loginUser() {
    setLoading(true);
    setError('');
    setStatus('Logging in...');

    const matched = DEMO_USERS.find(item => item.email === loginForm.email);
    const userId = matched ? matched.id : getUserIdFromEmail(loginForm.email);
    const publicKey = getStoredKeys(userId)?.publicKey || null;

    try {
      const response = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: loginForm.email, password: loginForm.password, publicKey }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Login failed');
        setStatus('Login failed');
        setLoading(false);
        return;
      }

      const data = await response.json();
      setAccessToken(data.accessToken);
      setUser(data.user);
      setStoredSession(data.user, data.accessToken);
      setStatus('Ready');
      setLoginForm(INITIAL_FORM);
      navigate('/inbox');
    } catch (err) {
      console.error(err);
      setError('Unable to connect to auth server');
      setStatus('Login error');
    } finally {
      setLoading(false);
    }
  }

  async function registerUser() {
    setLoading(true);
    setError('');
    setStatus('Creating account...');

    const { name, email, password, role } = registerForm;
    if (!name || !email || !password) {
      setError('Name, email, and password are required');
      setStatus('Registration failed');
      setLoading(false);
      return;
    }

    const userId = getUserIdFromEmail(email);
    const publicKey = getStoredKeys(userId)?.publicKey || null;

    try {
      const response = await fetch(`${SERVER_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, password, role, publicKey }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Registration failed');
        setStatus('Registration failed');
        setLoading(false);
        return;
      }

      const data = await response.json();
      setAccessToken(data.accessToken);
      setUser(data.user);
      setStoredSession(data.user, data.accessToken);
      setStatus('Ready');
      setRegisterForm(INITIAL_REGISTER);
      setAuthMode('login');
      navigate('/inbox');
    } catch (err) {
      console.error(err);
      setError('Unable to connect to auth server');
      setStatus('Registration error');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch(`${SERVER_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (err) {
      console.error(err);
    }
    clearStoredSession();
    setUser(null);
    setAccessToken('');
    setChats([]);
    setActiveChat(null);
    setMessages([]);
    setStatus('Logged out');
    navigate('/');
  }

  async function fetchChats() {
    if (!user) return;
    try {
      const response = await authFetch(`${SERVER_URL}/api/chats`);
      if (!response.ok) return;
      const data = await response.json();
      setChats(data);
      if (activeChat?.id) {
        const updated = data.find(item => item.id === activeChat.id);
        if (updated && updated.otherPublicKey && updated.otherPublicKey !== activeChat.otherPublicKey) {
          setActiveChat(prev => ({ ...prev, ...updated }));
        }
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function openChat(chat, navigateTo) {
    if (!socket || !user) return;
    try {
      const response = await authFetch(`${SERVER_URL}/api/chats/${chat.id}/messages`);
      if (!response.ok) return;
      const payload = await response.json();
      socket.emit('join_chat', { chatId: chat.id });
      setActiveChat({ ...chat, otherPublicKey: chat.otherPublicKey });
      setMessages(payload.map(message => ({ ...message, chatId: chat.id })));
      setChats(prev => {
        if (prev.some(item => item.id === chat.id)) return prev;
        return [...prev, chat];
      });
      socket.emit('mark_chat_read', { chatId: chat.id }, result => {
        if (!result?.success) {
          console.warn('Mark chat read failed');
        }
      });
      if (navigateTo) {
        navigateTo(`/chat/${chat.id}`);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function deriveKeyForActiveChat() {
    if (!activeChat?.otherPublicKey || !keys?.secretKey) return null;
    try {
      return deriveSharedKey(
        deserializeKey(keys.secretKey),
        deserializeKey(activeChat.otherPublicKey)
      );
    } catch (error) {
      return null;
    }
  }

  async function startChat(otherUserId, navigateTo) {
    if (!socketConnected) {
      setStatus('Waiting for socket connection...');
      return;
    }

    const recipientId = otherUserId || 'employer';
    if (!recipientId) {
      setStatus('Unable to start chat: missing recipient');
      return;
    }

    const publicKey = keys?.publicKey || getStoredKeys(user?.id)?.publicKey;
    if (!publicKey) {
      setStatus('Unable to start chat: missing encryption key');
      return;
    }

    setStatus('Starting secure chat...');
    socket.emit(
      'start_chat',
      {
        toUserId: recipientId,
        publicKey,
      },
      chat => {
        if (chat?.error) {
          console.error('start_chat failed', chat.error);
          setStatus('Unable to open secure chat');
          return;
        }
        if (!chat?.id) {
          setStatus('Unable to open secure chat');
          return;
        }
        setStatus('Secure chat opened');
        openChat(chat, navigateTo);
      }
    );
  }

  function decryptChatMessage(message) {
    const sharedKey = deriveKeyForActiveChat();
    if (!sharedKey) return '[waiting for recipient key]';
    const text = decryptMessage(sharedKey, message.encryptedPayload);
    return text ?? '[cannot decrypt]';
  }

  function getInboxLabel(otherId) {
    const found = DEMO_USERS.find(u => u.id === otherId);
    return found ? `${found.name} (${found.role})` : otherId;
  }

  async function sendMessage() {
    if (!activeChat || !draft.trim() || !socket) return;
    const sharedKey = deriveKeyForActiveChat();
    if (!sharedKey) {
      setStatus('Waiting for recipient key');
      return;
    }

    const encryptedPayload = encryptMessage(sharedKey, draft.trim());
    const payload = {
      chatId: activeChat.id,
      encryptedPayload,
    };

    socket.emit('send_message', payload, result => {
      if (result?.error) {
        setStatus('Message send failed');
        return;
      }
      setMessages(prev => [
        ...prev,
        {
          ...payload,
          senderId: user.id,
          timestamp: new Date().toISOString(),
          id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        },
      ]);
      setDraft('');
      setStatus('Message sent');
    });
  }

  function deleteMessage(messageId) {
    if (!socket || !activeChat || !messageId) return;
    socket.emit('delete_message', { chatId: activeChat.id, messageId }, result => {
      if (result?.error) {
        setStatus('Unable to delete message');
        return;
      }
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      setStatus('Message deleted');
    });
  }

  if (!user) {
    const isRegister = authMode === 'register';
    const authTitle = isRegister ? 'Create a secure account' : 'Sign in to your workspace';
    const authSubtitle = AUTH_DESCRIPTION;

    return (
      <div className="min-h-screen bg-slate-950 px-4 py-10 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-5xl rounded-[28px] bg-slate-900/90 p-8 shadow-glow ring-1 ring-white/10 backdrop-blur-xl sm:p-10"
        >
          <div className="grid gap-10 lg:grid-cols-[1.3fr_0.9fr] lg:items-center">
            <div>
              <p className="mb-4 uppercase tracking-[0.3em] text-sm font-semibold text-indigo-300/80">
                {APP_NAME}
              </p>
              <h1 className="text-4xl font-semibold text-white sm:text-5xl">{authTitle}</h1>
              <p className="mt-4 max-w-xl text-slate-300/90 sm:text-lg">{APP_TAGLINE}</p>
              <div className="mt-6 inline-flex flex-wrap items-center gap-4 rounded-[28px] border border-slate-800/90 bg-slate-950/90 p-4 shadow-sm shadow-black/10">
                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/20">
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16v12H5.5L4 19.5V4z" />
                    <path d="M8 8h8" />
                    <path d="M8 12h4" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Career Connect</p>
                  <p className="text-sm text-slate-400">Invite, message, and close hiring conversations with private encrypted chat.</p>
                </div>
              </div>

              {!isRegister && (
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  {DEMO_USERS.map(profile => (
                    <button
                      key={profile.id}
                      onClick={() => setLoginForm({ email: profile.email, password: profile.id === 'jobseeker' ? 'password123' : 'password456' })}
                      className="rounded-3xl border border-slate-700/80 bg-slate-800/80 px-5 py-4 text-left text-slate-200 transition hover:border-indigo-400/40 hover:bg-slate-700"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500 text-lg font-semibold text-white shadow-lg shadow-indigo-500/20">
                          {profile.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-white">{profile.name}</p>
                          <p className="text-sm text-slate-400">{profile.role}</p>
                          <p className="text-xs text-slate-500">{profile.email}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="rounded-[28px] border border-white/5 bg-slate-950/80 p-8 shadow-2xl shadow-slate-950/40"
            >
              <div className="mb-6 flex items-center justify-between gap-3 rounded-full bg-slate-900/80 p-2">
                <button
                  onClick={() => setAuthMode('login')}
                  className={`rounded-full px-5 py-2 text-sm font-semibold transition ${!isRegister ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:text-white'}`}
                >
                  Sign in
                </button>
                <button
                  onClick={() => setAuthMode('register')}
                  className={`rounded-full px-5 py-2 text-sm font-semibold transition ${isRegister ? 'bg-indigo-500 text-white' : 'text-slate-300 hover:text-white'}`}
                >
                  Register
                </button>
              </div>

              <p className="text-sm uppercase tracking-[0.3em] text-indigo-300/80">{isRegister ? 'Register' : 'Secure login'}</p>
              <div className="mt-6 space-y-4">
                {isRegister ? (
                  <>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-300">Full name</span>
                      <input
                        type="text"
                        value={registerForm.name}
                        onChange={e => setRegisterForm(prev => ({ ...prev, name: e.target.value }))}
                        className="mt-2 w-full rounded-3xl border border-slate-700/80 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="John Seeker"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-300">Email</span>
                      <input
                        type="email"
                        value={registerForm.email}
                        onChange={e => setRegisterForm(prev => ({ ...prev, email: e.target.value }))}
                        className="mt-2 w-full rounded-3xl border border-slate-700/80 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="email@example.com"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-300">Password</span>
                      <div className="relative mt-2">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={registerForm.password}
                          onChange={e => setRegisterForm(prev => ({ ...prev, password: e.target.value }))}
                          className="w-full rounded-3xl border border-slate-700/80 bg-slate-900 px-4 py-3 pr-12 text-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                          placeholder="Create a strong password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(prev => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                          {showPassword ? (
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19.5c-5.2 0-9.42-3.33-11-8 1.07-2.65 2.84-4.86 5.2-6.23" />
                              <path d="M1 1l22 22" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-300">Role</span>
                      <select
                        value={registerForm.role}
                        onChange={e => setRegisterForm(prev => ({ ...prev, role: e.target.value }))}
                        className="mt-2 w-full rounded-3xl border border-slate-700/80 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                      >
                        {USER_ROLES.map(role => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-300">Email</span>
                      <input
                        type="email"
                        value={loginForm.email}
                        onChange={e => setLoginForm(prev => ({ ...prev, email: e.target.value }))}
                        className="mt-2 w-full rounded-3xl border border-slate-700/80 bg-slate-900 px-4 py-3 text-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="john.seeker@example.com"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-300">Password</span>
                      <div className="relative mt-2">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={loginForm.password}
                          onChange={e => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                          className="w-full rounded-3xl border border-slate-700/80 bg-slate-900 px-4 py-3 pr-12 text-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                          placeholder="password123"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(prev => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                          {showPassword ? (
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19.5c-5.2 0-9.42-3.33-11-8 1.07-2.65 2.84-4.86 5.2-6.23" />
                              <path d="M1 1l22 22" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </label>
                  </>
                )}
              </div>

              {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}

              <button
                onClick={isRegister ? registerUser : loginUser}
                disabled={loading}
                className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-3 text-base font-semibold text-white shadow-xl shadow-indigo-500/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (isRegister ? 'Creating account…' : 'Signing in…') : (isRegister ? 'Create account' : 'Sign in securely')}
              </button>

              <p className="mt-6 text-sm text-slate-500">
                {isRegister ? (
                  <>Already have an account? <button onClick={() => setAuthMode('login')} className="font-semibold text-white underline">Sign in</button>.</>
                ) : (
                  <>New to the portal? <button onClick={() => setAuthMode('register')} className="font-semibold text-white underline">Register now</button>.</>
                )}
              </p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    );
  }

  const currentUser = user;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <motion.aside
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-[32px] border border-white/5 bg-slate-900/90 p-6 shadow-glow backdrop-blur-xl"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-indigo-300/80">Workspace</p>
                <h2 className="mt-3 text-3xl font-semibold text-white">Conversations</h2>
              </div>
              <button
                onClick={handleLogout}
                className="rounded-2xl bg-slate-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-600"
              >
                Sign out
              </button>
            </div>

            <div className="mt-6 rounded-[28px] border border-white/5 bg-slate-950/80 p-5 shadow-sm shadow-black/20">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xl font-semibold text-white shadow-md shadow-violet-500/20">
                  {currentUser?.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{currentUser?.name}</p>
                  <p className="text-xs text-slate-400">{currentUser?.email}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.24em] text-indigo-300/80">{currentUser?.role}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <NavLink
                to="/inbox"
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                    isActive ? 'bg-indigo-500 text-white' : 'bg-slate-800/70 text-slate-200 hover:bg-slate-800'
                  }`
                }
              >
                📬 Inbox
              </NavLink>
              {currentUser?.role === 'Job Seeker' && (
                <NavLink
                  to="/jobs"
                  className={({ isActive }) =>
                    `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                      isActive ? 'bg-indigo-500 text-white' : 'bg-slate-800/70 text-slate-200 hover:bg-slate-800'
                    }`
                  }
                >
                  💼 Jobs
                </NavLink>
              )}
              {currentUser?.role === 'Employer' && (
                <NavLink
                  to="/profiles"
                  className={({ isActive }) =>
                    `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                      isActive ? 'bg-indigo-500 text-white' : 'bg-slate-800/70 text-slate-200 hover:bg-slate-800'
                    }`
                  }
                >
                  👥 Profiles
                </NavLink>
              )}
            </div>

            <div className="mt-8 space-y-4">
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
                  element={<JobList jobs={JOB_POSTINGS} onStart={job => startChat(job.employerId, navigate)} canStart={socketConnected} />}
                />
                <Route
                  path="/profiles"
                  element={<ProfileList profiles={CANDIDATE_PROFILES} onStart={profile => startChat(profile.id, navigate)} canStart={socketConnected} />}
                />
                <Route
                  path="/profiles/:profileId"
                  element={<ProfileDetail profiles={CANDIDATE_PROFILES} onStart={profile => startChat(profile.id, navigate)} canStart={socketConnected} />}
                />
                <Route
                  path="/chat/:chatId"
                  element={<InboxList chats={chats} getInboxLabel={getInboxLabel} onOpen={chat => openChat(chat, navigate)} />}
                />
              </Routes>
            </div>
          </motion.aside>

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[32px] border border-white/5 bg-slate-900/95 p-6 shadow-glow backdrop-blur-xl"
          >
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-indigo-300/80">Secure conversation</p>
                <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
                  {activeChat ? getInboxLabel(activeChat.otherUserId) : 'Select a conversation'}
                </h1>
              </div>
              <span className="inline-flex items-center rounded-full bg-slate-800/80 px-4 py-2 text-sm text-slate-300">
                {status}
              </span>
            </div>

            <div className="min-h-[520px] rounded-[28px] border border-white/5 bg-slate-950/80 p-4 shadow-inner shadow-slate-900/30 sm:p-6">
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
                      deleteMessage={deleteMessage}
                      openChat={openChat}
                      getInboxLabel={getInboxLabel}
                      userId={user?.id}
                    />
                  }
                />
                <Route
                  path="*"
                  element={
                    <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[24px] bg-slate-900/80 p-10 text-center text-slate-400">
                      <div className="mb-5 text-6xl">💬</div>
                      <h3 className="mb-3 text-2xl font-semibold text-white">No chat selected</h3>
                      <p className="max-w-md text-sm leading-6 text-slate-400">
                        Select an existing conversation or begin a new encrypted chat from jobs and profiles.
                      </p>
                    </div>
                  }
                />
              </Routes>
            </div>
          </motion.section>
        </div>
      </div>
    </div>
  );
}

function InboxList({ chats, getInboxLabel, onOpen }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Recent hiring conversations</h3>
      {chats.length === 0 && <p className="text-sm text-slate-400">No conversations yet.</p>}
      <div className="space-y-3">
        {chats.map(chat => (
          <motion.button
            key={chat.id}
            whileHover={{ y: -2 }}
            transition={{ duration: 0.2 }}
            onClick={() => onOpen(chat)}
            className="w-full rounded-3xl border border-white/5 bg-slate-950/80 p-4 text-left shadow-sm shadow-black/10"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-lg font-semibold text-white shadow-lg shadow-indigo-500/20">
                {getInboxLabel(chat.otherUserId).charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-base font-semibold text-white">{getInboxLabel(chat.otherUserId)}</p>
                  {chat.unreadCount > 0 && (
                    <span className="rounded-full bg-indigo-500 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                      {chat.unreadCount}
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-sm text-slate-400">
                  {chat.lastMessage ? `${chat.lastMessage.senderId}: ${new Date(chat.lastMessage.timestamp).toLocaleTimeString()}` : 'No messages yet'}
                </p>
              </div>
              <span className="text-xs text-slate-500">
                {chat.lastMessage ? new Date(chat.lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
              </span>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function JobList({ jobs, onStart, canStart }) {
  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold text-white">Recommended roles</h3>
      {jobs.map(job => (
        <motion.div
          key={job.id}
          whileHover={{ y: -2 }}
          className="rounded-[28px] border border-white/5 bg-slate-950/80 p-5 shadow-sm shadow-black/10"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lg font-semibold text-white">{job.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">{job.summary}</p>
            </div>
            <button
              onClick={() => onStart(job.employerId)}
              disabled={!onStart || !canStart}
              className={`mt-4 inline-flex items-center gap-2 rounded-2xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-100 shadow-sm shadow-black/15 transition duration-200 sm:mt-0 ${canStart ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-800/70 cursor-not-allowed text-slate-400'}`}
              title={canStart ? 'Start secure chat' : 'Connecting...'}
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-2xl bg-slate-900 text-slate-100 shadow-inner shadow-black/10">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              Start secure chat
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function ProfileList({ profiles, onStart, canStart }) {
  const navigate = useNavigate();

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold text-white">Candidate profiles</h3>
      {profiles.map(profile => (
        <motion.div
          key={profile.id}
          whileHover={{ y: -2 }}
          className="rounded-[28px] border border-white/5 bg-slate-950/80 p-5 shadow-sm shadow-black/10"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-3 cursor-pointer" onClick={() => navigate(`/profiles/${profile.id}`)}>
              <p className="text-lg font-semibold text-white hover:text-indigo-300">{profile.name}</p>
              <p className="text-sm text-slate-400">{profile.title}</p>
              <p className="text-sm text-slate-500">Skills: {profile.skills}</p>
            </div>
            <div className="flex flex-col items-start gap-3 sm:items-end">
              <button
                onClick={() => onStart(profile.id)}
                disabled={!onStart || !canStart}
                className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-slate-100 shadow-sm shadow-black/15 transition duration-200 ${canStart ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-800/70 cursor-not-allowed text-slate-400'}`}
                title={canStart ? 'Start secure chat' : 'Connecting...'}
              >
                Start secure chat
              </button>
              <button
                type="button"
                onClick={() => navigate(`/profiles/${profile.id}`)}
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-white"
              >
                View profile
              </button>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function ProfileDetail({ profiles, onStart, canStart }) {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const profile = profiles.find(item => item.id === profileId);

  if (!profile) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-[24px] bg-slate-900/80 p-8 text-center text-slate-400">
        <p>Profile not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-white/5 bg-slate-950/80 p-6 shadow-sm shadow-black/20">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-indigo-300/80">Candidate profile</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">{profile.name}</h2>
            <p className="mt-3 text-sm text-slate-400">{profile.title}</p>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              This candidate is ready for a private one-to-one conversation. Employers can message directly from this page and open a secure, encrypted chat.
            </p>
          </div>
          <div className="rounded-[28px] border border-white/5 bg-slate-900/90 p-5 text-center shadow-inner shadow-slate-900/30">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Core skills</p>
            <p className="mt-4 text-xl font-semibold text-white">{profile.skills}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => onStart(profile.id)}
          disabled={!onStart || !canStart}
          className={`inline-flex items-center justify-center rounded-2xl px-6 py-3 text-sm font-semibold text-slate-100 shadow-sm shadow-black/15 transition duration-200 ${canStart ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-800/70 cursor-not-allowed text-slate-400'}`}
          title={canStart ? 'Start secure chat' : 'Connecting...'}
        >
          Start secure chat
        </button>
        <button
          type="button"
          onClick={() => navigate('/profiles')}
          className="inline-flex items-center justify-center rounded-full border border-white/10 bg-slate-900 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-white"
        >
          Back to profiles
        </button>
      </div>
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
  deleteMessage,
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
      <div className="flex min-h-[420px] items-center justify-center rounded-[24px] bg-slate-900/80 p-8 text-center text-slate-400">
        <p>Loading chat...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto pr-1 no-scrollbar">
        {messages.map(message => {
          const isSelf = message.senderId === userId;
          return (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[85%] rounded-3xl p-4 shadow-lg ${isSelf ? 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white' : 'bg-slate-800 text-slate-200'}`}>
                <p className="whitespace-pre-wrap text-sm leading-6">{decryptChatMessage(message)}</p>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-2">
                    <span>{isSelf ? 'You' : getInboxLabel(message.senderId)}</span>
                    {isSelf && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/90 px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-slate-300">
                        {message.readBy?.includes(activeChat?.otherUserId)
                          ? '✓✓ Read'
                          : message.deliveredBy?.includes(activeChat?.otherUserId)
                          ? '✓✓ Delivered'
                          : '✓ Sent'}
                      </span>
                    )}
                    {isSelf && (
                      <button
                        type="button"
                        onClick={() => deleteMessage(message.id)}
                        className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-200 transition hover:text-white"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="rounded-[28px] border border-white/5 bg-slate-950/90 p-4 shadow-inner shadow-slate-900/40">
        <textarea
          rows="4"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          className="w-full resize-none rounded-3xl border border-slate-800/90 bg-slate-900 px-4 py-4 text-sm text-slate-100 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
          placeholder="Write your encrypted message..."
        />
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">Encrypted chat is only visible to the two participants.</p>
          <button
            onClick={sendMessage}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:opacity-95"
          >
            Send securely
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
