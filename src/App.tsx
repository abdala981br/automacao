import { useState, useEffect, useRef } from 'react';
import { 
  Briefcase, 
  Settings, 
  User, 
  PlayCircle, 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  MessageSquare, 
  Save,
  Activity,
  LogOut,
  Linkedin,
  Lock,
  Loader2
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged, 
  User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  serverTimestamp 
} from 'firebase/firestore';

// --- CONFIGURAÇÃO DO FIREBASE ---
// IMPORTANTE: O site vai carregar, mas o login só vai funcionar 
// quando você colocar suas chaves reais aqui.
// --- INÍCIO DA CORREÇÃO ---
let firebaseApp, auth, db;
let isFirebaseAvailable = false;

try {
  // Verifica se a configuração real do ambiente existe
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    const config = JSON.parse(__firebase_config);
    firebaseApp = initializeApp(config);
    auth = getAuth(firebaseApp);
    db = getFirestore(firebaseApp);
    isFirebaseAvailable = true;
  } else {
    console.warn("Sem configuração do Firebase. Modo Offline/Demo ativado.");
  }
} catch (error) {
  console.error("Erro fatal ao conectar no Firebase:", error);
}
// --- FIM DA CORREÇÃO ---
const appId = "meu-app-v1";

// --- Types ---

type ApplicationStatus = 'pending_bot' | 'applied' | 'needs_input' | 'failed';

interface JobApplication {
  id: string;
  company: string;
  role: string;
  platform: 'LinkedIn' | 'Glassdoor' | 'Gupy' | 'Infojobs';
  date: string;
  status: ApplicationStatus;
  notes?: string;
  questionToAnswer?: string;
  timestamp?: any;
}

interface UserProfile {
  fullName: string;
  email: string;
  linkedinUrl: string;
  bio: string;
  experience: string;
  skills: string;
}

// --- Components ---

const StatusBadge = ({ status }: { status: ApplicationStatus }) => {
  const config = {
    pending_bot: { color: 'bg-yellow-100 text-yellow-800', icon: Activity, label: 'Processando' },
    applied: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Candidatado' },
    needs_input: { color: 'bg-blue-100 text-blue-800', icon: MessageSquare, label: 'Aguardando Você' },
    failed: { color: 'bg-red-100 text-red-800', icon: XCircle, label: 'Falha' },
  };

  const { color, icon: Icon, label } = config[status];

  return (
    <span className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${color}`}>
      <Icon size={12} />
      {label}
    </span>
  );
};

const LoginScreen = ({ onLogin, isLoading }: { onLogin: () => void, isLoading: boolean }) => (
  <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
    <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md text-center">
      <div className="flex justify-center mb-6">
        <div className="bg-indigo-100 p-4 rounded-full">
          <Briefcase className="text-indigo-600 w-10 h-10" />
        </div>
      </div>
      <h1 className="text-3xl font-bold text-slate-900 mb-2">AutoJob</h1>
      <p className="text-slate-500 mb-8">Automação inteligente para suas candidaturas.</p>
      
      <div className="space-y-4">
        <button 
          onClick={onLogin}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-[#0077b5] hover:bg-[#006396] text-white py-3 px-4 rounded-xl font-medium transition-all transform hover:scale-[1.02] disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Loader2 className="animate-spin w-5 h-5" />
          ) : (
            <>
              <Linkedin className="w-5 h-5" />
              Entrar com LinkedIn
            </>
          )}
        </button>
        
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-slate-500">ou</span>
          </div>
        </div>

        <button 
          onClick={onLogin}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 py-3 px-4 rounded-xl font-medium transition-all"
        >
          <Lock className="w-4 h-4" />
          Acesso Convidado Seguro
        </button>
      </div>
    </div>
  </div>
);

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'profile' | 'settings'>('dashboard');
  const [isBotRunning, setIsBotRunning] = useState(false);
  
  const [profile, setProfile] = useState<UserProfile>({
    fullName: '',
    email: '',
    linkedinUrl: '',
    bio: '',
    experience: '',
    skills: '',
  });
  const [applications, setApplications] = useState<JobApplication[]>([]);

  const botIntervalRef = useRef<any>(null);

  useEffect(() => {
    if (!isFirebaseAvailable) return;
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth error:", error);
      } finally {
        setAuthLoading(false);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setIsBotRunning(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'data', 'profile');
    const unsubProfile = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists()) {
        setProfile(docSnap.data() as UserProfile);
      } else {
        const defaultProfile = {
          fullName: 'Novo Usuário',
          email: '',
          linkedinUrl: '',
          bio: '',
          experience: '',
          skills: '',
        };
        setProfile(defaultProfile);
      }
    }, (error) => console.error("Profile sync error:", error));

    const appsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'applications');
    const unsubApps = onSnapshot(appsRef, (snapshot) => {
      const apps = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as JobApplication[];
      
      apps.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      setApplications(apps);
    }, (error) => console.error("Apps sync error:", error));

    return () => {
      unsubProfile();
      unsubApps();
    };
  }, [user]);

  useEffect(() => {
    return () => {
      if (botIntervalRef.current) clearInterval(botIntervalRef.current);
    };
  }, []);

  const handleLogin = async () => {
    setLoginLoading(true);
    if (!auth.currentUser) {
       await signInAnonymously(auth);
    }
    setTimeout(() => {
      setLoginLoading(false);
      setHasEntered(true);
    }, 800);
  };

  const handleLogout = async () => {
    setIsBotRunning(false);
    window.location.reload(); 
  };

  const saveProfile = async () => {
    if (!user) return;
    try {
      const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'data', 'profile');
      await setDoc(profileRef, profile);
      alert('Perfil salvo com sucesso na nuvem!');
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar perfil. Verifique as chaves do Firebase.');
    }
  };

  const handleManualResponse = async (appIdTarget: string, responseText: string) => {
    if (!user) return;
    try {
      const appRef = doc(db, 'artifacts', appId, 'users', user.uid, 'applications', appIdTarget);
      await updateDoc(appRef, {
        status: 'applied',
        questionToAnswer: "",
        notes: `Respondido manualmente: "${responseText.substring(0, 30)}..."`
      });
    } catch (e) {
      console.error(e);
    }
  };

  const toggleBot = () => {
    if (isBotRunning) {
      setIsBotRunning(false);
      if (botIntervalRef.current) clearInterval(botIntervalRef.current);
    } else {
      setIsBotRunning(true);
      botIntervalRef.current = setInterval(async () => {
        if (!user) return;
        
        const companies = ['TechCorp', 'InovaSoft', 'DataSystems', 'CloudWalk', 'BankOne'];
        const roles = ['Dev Python Jr', 'QA Automation', 'Frontend React', 'Fullstack Engineer', 'Data Analyst'];
        const platforms: Array<'LinkedIn' | 'Gupy' | 'Glassdoor' | 'Infojobs'> = ['LinkedIn', 'Gupy', 'Glassdoor', 'Infojobs'];
        
        const randomCompany = companies[Math.floor(Math.random() * companies.length)];
        const randomRole = roles[Math.floor(Math.random() * roles.length)];
        const randomPlatform = platforms[Math.floor(Math.random() * platforms.length)];
        
        const rand = Math.random();
        let status: ApplicationStatus = 'applied';
        let question = undefined;
        let notes = undefined;

        if (rand < 0.2) {
          status = 'needs_input';
          question = 'Por que você quer trabalhar nesta empresa?';
        } else if (rand < 0.3) {
          status = 'failed';
          notes = 'Erro de timeout no seletor CSS';
        } else if (rand < 0.5) {
          status = 'pending_bot';
        }

        const newJob = {
          company: randomCompany,
          role: randomRole,
          platform: randomPlatform,
          date: new Date().toISOString(),
          status: status,
          questionToAnswer: question,
          notes: notes,
          timestamp: serverTimestamp()
        };

        try {
          const appsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'applications');
          await addDoc(appsRef, newJob);
        } catch (e) {
          console.error("Bot error writing to DB", e);
        }

      }, 4000);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <Loader2 className="animate-spin text-indigo-600 w-8 h-8" />
      </div>
    );
  }

  const showLoginScreen = !user || !hasEntered;

  if (showLoginScreen) {
    return <LoginScreen onLogin={handleLogin} isLoading={loginLoading} />;
  }

  return (
    <div className="min-h-screen bg-slate-100 flex font-sans">
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col fixed h-full z-10 transition-all">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Briefcase className="text-indigo-400" />
            AutoJob <span className="text-xs bg-indigo-600 text-white px-1.5 rounded">BETA</span>
          </h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <Activity size={18} /> Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('profile')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'profile' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <User size={18} /> Meu Perfil
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <Settings size={18} /> Configurações
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 px-4 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold">
              {profile.fullName ? profile.fullName.substring(0, 2).toUpperCase() : 'US'}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm text-white font-medium truncate">{profile.fullName || 'Usuário'}</p>
              <p className="text-xs text-slate-500 truncate">Plano Free</p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-2 text-xs text-slate-500 hover:text-white transition-colors px-4">
            <LogOut size={12} /> Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-64 p-8 overflow-y-auto min-h-screen">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              {activeTab === 'dashboard' && 'Visão Geral'}
              {activeTab === 'profile' && 'Configuração de Perfil'}
              {activeTab === 'settings' && 'Integrações'}
            </h2>
            <p className="text-slate-500">
              {activeTab === 'dashboard' && 'Acompanhe o robô trabalhando por você.'}
              {activeTab === 'profile' && 'Mantenha seus dados atualizados para a IA.'}
            </p>
          </div>
          {activeTab === 'dashboard' && (
             <div className="flex items-center gap-2">
               {isBotRunning && <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>}
             </div>
          )}
        </header>

        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-slate-500">Candidaturas Totais</p>
                    <h3 className="text-2xl font-bold text-slate-800">{applications.length}</h3>
                  </div>
                  <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                    <Briefcase size={20} />
                  </div>
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-slate-500">Sucesso</p>
                    <h3 className="text-2xl font-bold text-slate-800">
                      {applications.filter(a => a.status === 'applied').length}
                    </h3>
                  </div>
                  <div className="p-2 bg-green-50 rounded-lg text-green-600">
                    <CheckCircle size={20} />
                  </div>
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-slate-500">Ação Necessária</p>
                    <h3 className="text-2xl font-bold text-slate-800">
                      {applications.filter(a => a.status === 'needs_input').length}
                    </h3>
                  </div>
                  <div className="p-2 bg-yellow-50 rounded-lg text-yellow-600">
                    <AlertCircle size={20} />
                  </div>
                </div>
              </div>
            </div>

            {applications.some(a => a.status === 'needs_input') && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  <MessageSquare size={18} />
                  Intervenção Manual Necessária
                </h3>
                <p className="text-blue-700 text-sm mb-4">
                  O Robô pausou nestas vagas porque a IA precisa de mais contexto.
                </p>
                <div className="space-y-3">
                  {applications.filter(a => a.status === 'needs_input').map(app => (
                    <div key={app.id} className="bg-white p-4 rounded-lg shadow-sm border border-blue-100">
                      <div className="flex justify-between mb-2">
                        <span className="font-medium text-slate-800">{app.company} - {app.role}</span>
                        <span className="text-xs text-slate-500">{app.platform}</span>
                      </div>
                      <p className="text-sm text-slate-600 mb-3 bg-slate-50 p-2 rounded italic">
                        "{app.questionToAnswer}"
                      </p>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          id={`input-${app.id}`}
                          placeholder="Digite sua resposta aqui..." 
                          className="flex-1 border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleManualResponse(app.id, e.currentTarget.value);
                            }
                          }}
                        />
                        <button 
                          onClick={() => {
                            const input = document.getElementById(`input-${app.id}`) as HTMLInputElement;
                            if (input) handleManualResponse(app.id, input.value);
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors"
                        >
                          Enviar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="font-semibold text-slate-800">Histórico de Automação</h2>
                <button 
                  onClick={toggleBot}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors w-full md:w-auto justify-center ${
                    isBotRunning 
                      ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100' 
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg'
                  }`}
                >
                  {isBotRunning ? (
                    <> <Activity className="animate-spin" size={16} /> Parar Robô </>
                  ) : (
                    <> <PlayCircle size={16} /> Iniciar Automação </>
                  )}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-6 py-3 font-medium">Empresa / Vaga</th>
                      <th className="px-6 py-3 font-medium">Plataforma</th>
                      <th className="px-6 py-3 font-medium">Data</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium">Notas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {applications.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-slate-500 italic">
                          Nenhuma candidatura ainda. Inicie o robô para começar!
                        </td>
                      </tr>
                    ) : (
                      applications.map((app) => (
                        <tr key={app.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-medium text-slate-900">{app.company}</div>
                            <div className="text-slate-500 text-xs">{app.role}</div>
                          </td>
                          <td className="px-6 py-4 text-slate-600">{app.platform}</td>
                          <td className="px-6 py-4 text-slate-600">
                            {new Date(app.date).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge status={app.status} />
                          </td>
                          <td className="px-6 py-4 text-slate-500 text-xs truncate max-w-xs">
                            {app.notes || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-800 mb-6 flex items-center gap-2">
              <User size={20} /> Perfil Mestre
            </h2>
            <p className="text-sm text-slate-500 mb-6">
              Este é o currículo base que o robô usará. Alterações aqui são salvas na nuvem automaticamente.
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
                  <input 
                    type="text" 
                    value={profile.fullName}
                    onChange={e => setProfile({...profile, fullName: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input 
                    type="email" 
                    value={profile.email}
                    onChange={e => setProfile({...profile, email: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">LinkedIn URL</label>
                <div className="relative">
                  <Linkedin className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                  <input 
                    type="text" 
                    value={profile.linkedinUrl}
                    onChange={e => setProfile({...profile, linkedinUrl: e.target.value})}
                    className="w-full pl-9 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Habilidades</label>
                <input 
                  type="text" 
                  value={profile.skills}
                  onChange={e => setProfile({...profile, skills: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ex: Python, React, AWS..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Experiência</label>
                <textarea 
                  rows={4}
                  value={profile.experience}
                  onChange={e => setProfile({...profile, experience: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bio para IA</label>
                <textarea 
                  rows={4}
                  value={profile.bio}
                  onChange={e => setProfile({...profile, bio: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Instruções de como a IA deve responder sobre você..."
                />
              </div>

              <div className="pt-4 flex justify-end">
                <button 
                  onClick={saveProfile}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  <Save size={18} /> Salvar Perfil
                </button>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'settings' && (
          <div className="bg-white p-8 rounded-xl border border-slate-200 text-center py-20">
            <Settings size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-700">Conexões Externas</h3>
            <p className="text-slate-500 max-w-md mx-auto mt-2">
              Em produção, aqui você colocaria seus cookies do LinkedIn e API Key da OpenAI.
            </p>
            <div className="mt-8 flex justify-center gap-4 opacity-50 pointer-events-none select-none">
               <div className="p-4 border rounded bg-slate-50">LinkedIn Conectado</div>
               <div className="p-4 border rounded bg-slate-50">OpenAI Key: sk-....</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
