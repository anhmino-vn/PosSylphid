import React from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth, googleProvider, db, UserPermissions } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { LogIn } from 'lucide-react';
import { SylphidLogo } from '../components/SylphidLogo';

export function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showEmailLogin, setShowEmailLogin] = React.useState(false);
  const [isRegister, setIsRegister] = React.useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      await setupUserDoc(user);
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Cửa sổ đăng nhập đã bị đóng. Vui lòng thử lại.');
      } else if (err.code === 'auth/cancelled-by-user') {
        setError('Đăng nhập đã bị hủy.');
      } else {
        setError('Đăng nhập thất bại. Vui lòng kiểm tra kết nối và thử lại.');
      }
      console.error(err);
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Vui lòng nhập đầy đủ tài khoản và mật khẩu');
      return;
    }
    setLoading(true);
    setError('');

    let loginEmail = email.trim();
    let loginPassword = password;

    // Special bypass for admin/admin
    if (loginEmail.toLowerCase() === 'admin') {
      loginEmail = 'admin@sylphid.com';
      if (loginPassword === 'admin') {
        loginPassword = 'admin123'; // Firebase requires at least 6 characters
      }
    }

    try {
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      let result;
      try {
        result = await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      } catch (err: any) {
        // If user not found and it's the admin account, let's create it automatically!
        if (loginEmail === 'admin@sylphid.com' && (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials')) {
          try {
            const { createUserWithEmailAndPassword } = await import('firebase/auth');
            result = await createUserWithEmailAndPassword(auth, loginEmail, loginPassword);
          } catch (createErr: any) {
            if (createErr.code === 'auth/email-already-in-use') {
              throw new Error('Mật khẩu tài khoản admin không chính xác.');
            } else {
              throw createErr;
            }
          }
        } else {
          throw err;
        }
      }
      await setupUserDoc(result.user);
    } catch (err: any) {
      if (err.message === 'Mật khẩu tài khoản admin không chính xác.') {
        setError(err.message);
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Tài khoản hoặc mật khẩu không chính xác.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Đăng nhập bằng Email chưa được bật. Vui lòng liên hệ Admin cấu hình Firebase Console.');
      } else {
        setError('Đăng nhập thất bại. Vui lòng kiểm tra kết nối.');
      }
      console.error(err);
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !confirmPassword) {
      setError('Vui lòng điền đầy đủ các thông tin');
      return;
    }
    if (password.length < 6) {
      setError('Mật khẩu phải chứa ít nhất 6 ký tự');
      return;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { createUserWithEmailAndPassword } = await import('firebase/auth');
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await setupUserDoc(result.user);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('Địa chỉ email này đã được đăng ký sử dụng.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Định dạng email không chính xác.');
      } else {
        setError('Đăng ký thất bại. Vui lòng kiểm tra kết nối.');
      }
      console.error(err);
      setLoading(false);
    }
  };

  const setupUserDoc = async (user: import('firebase/auth').User) => {
    try {
      // Check if user profile exists, if not create as staff by default (or admin if email matches)
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        const isAdmin = user.email === 'anhmino.it@gmail.com' || user.email === 'ngocanhvux4@gmail.com' || user.email === 'admin@sylphid.com';
        
        const defaultPermissions: UserPermissions = {
          products: { view: true, add: isAdmin, edit: isAdmin, delete: isAdmin },
          orders: { view: true, add: true, edit: isAdmin, delete: isAdmin },
          stock: { view: true, import: isAdmin, export: isAdmin },
          customers: { view: true, edit: true },
          reports: { view: isAdmin }
        };

        await setDoc(docRef, {
          uid: user.uid,
          email: user.email,
          role: isAdmin ? 'admin' : 'staff',
          shopName: 'POS SYLPHID',
          permissions: defaultPermissions,
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        // Ensure admin email always has admin role and full permissions
        if (user.email === 'anhmino.it@gmail.com' || user.email === 'ngocanhvux4@gmail.com' || user.email === 'admin@sylphid.com') {
          const profile = docSnap.data();
          if (profile.role !== 'admin' || !profile.permissions?.reports?.view) {
            await setDoc(docRef, { 
              role: 'admin',
              permissions: {
                products: { view: true, add: true, edit: true, delete: true },
                orders: { view: true, add: true, edit: true, delete: true },
                stock: { view: true, import: true, export: true },
                customers: { view: true, edit: true },
                reports: { view: true },
                services: { view: true, add: true, edit: true, delete: true },
                documents: { view: true, add: true, edit: true, delete: true, print: true },
                staff: { view: true, add: true, edit: true }
              }
            }, { merge: true });
          }
        } else {
          // check if locked
          const profile = docSnap.data();
          if (profile.status === 'locked') {
             const { signOut } = await import('firebase/auth');
             await signOut(auth);
             setError('Tài khoản của bạn đã bị khóa.');
             setLoading(false);
             return;
          }
        }
      }
      
      const { logActivity } = await import('../lib/activityUtils');
      await logActivity(user as any, 'Hệ thống', 'Đăng nhập', `Đăng nhập thành công`);
      navigate('/');
    } catch (err: any) {
       console.error("Setup user doc error:", err);
       setError("Lỗi khi thiết lập tài khoản");
       setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 bg-[url('https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"></div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-[32px] shadow-2xl p-10 relative z-10 overflow-hidden border border-white/20"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-6">
            <SylphidLogo className="w-16 h-16 shadow-xl rounded-full" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight uppercase leading-tight">
            POS SYLPHID
          </h1>
          <p className="text-slate-500 mt-2 font-semibold text-sm sm:text-base whitespace-pre-line leading-relaxed">
            Hệ thống Quản lý
            Trung tâm Sức khỏe
          </p>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-8 p-4 bg-rose-50 text-rose-600 text-xs font-bold rounded-2xl border border-rose-100 flex items-center gap-3 uppercase tracking-wider"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse"></span>
            {error}
          </motion.div>
        )}

        <div className="space-y-4">
          <button 
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full h-14 flex items-center justify-center gap-4 bg-white border border-slate-200 hover:border-blue-200 hover:bg-blue-50/30 text-slate-700 font-bold rounded-2xl transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:pointer-events-none group"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5 group-hover:scale-110 transition-transform" />
            TIẾP TỤC VỚI GOOGLE
          </button>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-100"></div>
            </div>
            <div className="relative flex justify-center text-[10px] font-black uppercase tracking-widest">
              <span className="bg-white px-4 text-slate-400">Hoặc tài khoản nội bộ</span>
            </div>
          </div>

          {!showEmailLogin ? (
            <button onClick={() => setShowEmailLogin(true)} className="w-full h-14 bg-slate-900 text-white font-black rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 active:scale-95 flex items-center justify-center gap-3 uppercase tracking-widest text-sm">
              <LogIn className="w-5 h-5" />
              Đăng nhập bằng Email
            </button>
          ) : (
            <div className="space-y-6">
              <div className="flex bg-slate-100 p-1 rounded-2xl">
                <button 
                  type="button"
                  onClick={() => { setIsRegister(false); setError(''); }}
                  className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${!isRegister ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Đăng nhập
                </button>
                <button 
                  type="button"
                  onClick={() => { setIsRegister(true); setError(''); }}
                  className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${isRegister ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Đăng ký
                </button>
              </div>

              {!isRegister ? (
                <form onSubmit={handleEmailLogin} className="space-y-4 animate-in fade-in duration-300">
                  <input 
                    type="text" 
                    placeholder="Tài khoản hoặc Email" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    required 
                    className="w-full h-14 px-5 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 font-bold text-slate-900 text-sm" 
                  />
                  <input 
                    type="password" 
                    placeholder="Mật khẩu" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    required 
                    className="w-full h-14 px-5 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 font-bold text-slate-900 text-sm" 
                  />
                  <button 
                    type="submit" 
                    disabled={loading} 
                    className="w-full h-14 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/30 active:scale-95 flex items-center justify-center gap-3 uppercase tracking-widest text-sm disabled:opacity-50"
                  >
                    <LogIn className="w-5 h-5" />
                    Đăng nhập
                  </button>
                  <button 
                    type="button" 
                    onClick={() => { setShowEmailLogin(false); setError(''); }} 
                    className="w-full text-center text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors py-2 uppercase tracking-wider"
                  >
                    Quay lại
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-4 animate-in fade-in duration-300">
                  <input 
                    type="email" 
                    placeholder="Địa chỉ Email" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    required 
                    className="w-full h-14 px-5 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 font-bold text-slate-900 text-sm" 
                  />
                  <input 
                    type="password" 
                    placeholder="Mật khẩu (tối thiểu 6 ký tự)" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    required 
                    className="w-full h-14 px-5 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 font-bold text-slate-900 text-sm" 
                  />
                  <input 
                    type="password" 
                    placeholder="Xác nhận mật khẩu" 
                    value={confirmPassword} 
                    onChange={e => setConfirmPassword(e.target.value)} 
                    required 
                    className="w-full h-14 px-5 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20 font-bold text-slate-900 text-sm" 
                  />
                  <button 
                    type="submit" 
                    disabled={loading} 
                    className="w-full h-14 bg-emerald-600 text-white font-black rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-500/30 active:scale-95 flex items-center justify-center gap-3 uppercase tracking-widest text-sm disabled:opacity-50"
                  >
                    <LogIn className="w-5 h-5" />
                    Đăng ký tài khoản
                  </button>
                  <button 
                    type="button" 
                    onClick={() => { setShowEmailLogin(false); setError(''); }} 
                    className="w-full text-center text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors py-2 uppercase tracking-wider"
                  >
                    Quay lại
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        <p className="mt-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
          Bản quyền © 2024 POS SYLPHID Solutions
        </p>
      </motion.div>
    </div>
  );
}
