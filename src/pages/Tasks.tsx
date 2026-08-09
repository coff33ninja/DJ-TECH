import React, { useState, useEffect } from 'react';
import { googleSignIn, initAuth, logout } from '../lib/auth';
import { CheckSquare, Plus, Loader, AlertCircle, Circle, CheckCircle2 } from 'lucide-react';

export default function Tasks() {
  const [needsAuth, setNeedsAuth] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  
  const [taskLists, setTaskLists] = useState<any[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>('@default');
  const [tasks, setTasks] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingTask, setAddingTask] = useState(false);

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, t) => {
        setToken(t);
        setNeedsAuth(false);
      },
      () => setNeedsAuth(true)
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (token) {
      fetchTaskLists();
    }
  }, [token]);

  useEffect(() => {
    if (token && selectedListId) {
      fetchTasks(selectedListId);
    }
  }, [token, selectedListId]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setToken(result.accessToken);
        setNeedsAuth(false);
      }
    } catch (err) {
      console.error('Login failed:', err);
      setError('Authentication failed. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const fetchTaskLists = async () => {
    if (!token) return;
    try {
      const res = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch task lists');
      const data = await res.json();
      setTaskLists(data.items || []);
      if (data.items && data.items.length > 0 && selectedListId === '@default') {
        setSelectedListId(data.items[0].id);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const fetchTasks = async (listId: string) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks?showCompleted=true&showHidden=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch tasks');
      const data = await res.json();
      setTasks(data.items || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newTaskTitle.trim()) return;
    
    setAddingTask(true);
    try {
      const res = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${selectedListId}/tasks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: newTaskTitle })
      });
      if (!res.ok) throw new Error('Failed to create task');
      
      setNewTaskTitle('');
      fetchTasks(selectedListId);
    } catch (err: any) {
      alert('Error creating task: ' + err.message);
    } finally {
      setAddingTask(false);
    }
  };

  const toggleTaskCompletion = async (task: any) => {
    if (!token) return;
    
    const newStatus = task.status === 'completed' ? 'needsAction' : 'completed';
    
    // Optimistic update
    setTasks(tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    
    try {
      const res = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${selectedListId}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) {
        throw new Error('Failed to update task');
      }
    } catch (err: any) {
      // Revert on failure
      fetchTasks(selectedListId);
      console.error(err);
    }
  };

  if (needsAuth) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center max-w-md w-full text-center">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-4">
            <CheckSquare size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Connect Google Tasks</h2>
          <p className="text-sm text-slate-500 mb-6">Authorize DJ Tech to view and manage follow-ups, deliveries, and reminders via Google Tasks.</p>
          <button 
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="gsi-material-button w-full"
            style={{ width: '100%', height: '40px', backgroundColor: '#fff', border: '1px solid #dadce0', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block', width: '18px', height: '18px' }}>
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  <path fill="none" d="M0 0h48v48H0z"></path>
                </svg>
                <span style={{ fontFamily: 'Roboto, arial, sans-serif', fontSize: '14px', fontWeight: 500, color: '#3c4043' }}>
                  {isLoggingIn ? 'Signing in...' : 'Sign in with Google'}
                </span>
             </div>
          </button>
          {error && <p className="text-red-500 text-xs mt-4">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Tasks & Reminders</h1>
          <p className="text-sm text-slate-500 mt-1">Manage follow-ups and action items via Google Tasks.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={logout}
            className="text-slate-500 hover:text-slate-700 px-3 py-2 text-xs font-semibold"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 overflow-hidden flex-1 min-h-0">
        
        {/* Task Lists Sidebar */}
        <div className="w-full lg:w-64 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-0 overflow-y-auto">
          <div className="p-4 border-b border-slate-100 font-bold text-sm text-slate-800">
            Task Lists
          </div>
          <div className="flex-1 p-2">
            {taskLists.length === 0 ? (
              <div className="p-4 text-xs text-slate-500 text-center">Loading lists...</div>
            ) : (
              taskLists.map(list => (
                <button
                  key={list.id}
                  onClick={() => setSelectedListId(list.id)}
                  className={`w-full text-left px-3 py-2 rounded text-sm font-semibold transition-colors truncate ${selectedListId === list.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  {list.title}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Tasks Main Area */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-0">
          <div className="p-4 border-b border-slate-100">
            <form onSubmit={handleAddTask} className="flex gap-2">
              <input 
                type="text" 
                placeholder="Add a new task..."
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                disabled={addingTask}
              />
              <button 
                type="submit"
                disabled={addingTask || !newTaskTitle.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded font-semibold flex items-center gap-2 text-xs transition-colors"
              >
                <Plus size={16} />
                Add
              </button>
            </form>
          </div>
          
          <div className="flex-1 overflow-y-auto p-0">
            {loading ? (
              <div className="flex justify-center items-center h-40">
                <Loader className="animate-spin text-indigo-600" size={24} />
              </div>
            ) : error ? (
              <div className="p-6 text-center text-red-500 flex flex-col items-center gap-2">
                <AlertCircle size={24} />
                <p className="text-sm">{error}</p>
              </div>
            ) : tasks.length === 0 ? (
              <div className="p-10 text-center text-slate-500">
                No tasks found in this list.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {tasks.map(task => (
                  <div key={task.id} className="p-4 hover:bg-slate-50 transition-colors flex items-start gap-3 group">
                    <button 
                      onClick={() => toggleTaskCompletion(task)}
                      className="mt-0.5 flex-shrink-0 text-slate-400 hover:text-indigo-600 transition-colors"
                    >
                      {task.status === 'completed' ? (
                        <CheckCircle2 size={18} className="text-emerald-500" />
                      ) : (
                        <Circle size={18} />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                        {task.title}
                      </p>
                      {task.notes && (
                        <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{task.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
