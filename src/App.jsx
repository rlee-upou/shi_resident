import React, { useState, useEffect } from 'react';

import { createClient } from '@supabase/supabase-js';

import { 
  Heart, Zap, Dribbble, PlusCircle, CheckCircle2, ArrowRight, ShieldCheck, MapPin, Clock, Loader2, UserCheck, Activity, User
} from 'lucide-react';

// ==========================================
// SUPABASE INITIALIZATION
// ==========================================
// --- CANVAS PREVIEW MOCK ---
const createClientMock = () => {
  return {
    from: (tableName) => {
      const chain = {
        select: () => {
          const res = Promise.resolve({
            data: tableName === 'barangays' 
              ? [
                  { id: 1, name: 'Bgy. UP Campus' },
                  { id: 2, name: 'Bgy. Fairview' },
                  { id: 3, name: 'Bgy. Payatas' },
                  { id: 4, name: 'Bgy. Socorro' }
                ]
              : [], 
            error: null
          });
          res.eq = () => {
            const eqRes = Promise.resolve({ data: [], error: null });
            eqRes.gte = () => {
              const gteRes = Promise.resolve({ data: [], error: null });
              gteRes.lte = () => Promise.resolve({ data: [], error: null });
              return gteRes;
            };
            return eqRes;
          };
          return res;
        },
        insert: (payload) => {
          const res = Promise.resolve({ error: null });
          res.select = () => {
            const sel = Promise.resolve({ data: [payload[0]], error: null });
            sel.single = () => Promise.resolve({ data: { id: 'mock-uuid-123', ...payload[0] }, error: null });
            return sel;
          };
          return res;
        },
        update: (payload) => {
          const res = Promise.resolve({ error: null });
          res.eq = () => Promise.resolve({ error: null });
          return res;
        }
      };
      return chain;
    }
  };
};
// ---------------------------

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

const supabase = createClient(supabaseUrl, supabaseKey); // Swap to createClient for production

// Constants for local storage keys
const RESIDENT_ID_KEY = 'smarthealthindex_resident_id';
const AGE_GROUP_KEY = 'smarthealthindex_age_group';
const BARANGAY_ID_KEY = 'smarthealthindex_barangay_id';
const ACTIVITY_LOG_ID_KEY = 'smarthealthindex_activity_log_id'; // <-- NEW LINE ADDED

export default function ResidentApp() {
  const [syncStep, setSyncStep] = useState('choice'); // choice, manual, strava, success

  // --- CAPTCHA State ---
  const [captchaNum1, setCaptchaNum1] = useState(0);
  const [captchaNum2, setCaptchaNum2] = useState(0);
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaError, setCaptchaError] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReturningUser, setIsReturningUser] = useState(false);
  
  // Database & Local States
  const [barangays, setBarangays] = useState([]);
  const [formData, setFormData] = useState({ 
    steps: '', 
    walkMins: '',  // REPLACED mins
    runMins: '',   // NEW
    bikeMins: '',  // NEW
    otherMins: '', // NEW
    barangay_id: '',
    age_group: '25-34',
    gender: 'Female' // NEW
  });

  // Initialization: Fetch Barangays & Load Local History
  useEffect(() => {
    async function fetchBarangays() {
      const { data, error } = await supabase.from('barangays').select('id, name');
      if (data && data.length > 0) {
        setBarangays(data);
        setFormData(prev => {
          // Check if the previously saved barangay_id still exists in the database
          const isBarangayValid = prev.barangay_id && data.some(b => b.id.toString() === prev.barangay_id);
          if (isBarangayValid) return prev;
          return { ...prev, barangay_id: data[0].id.toString() };
        });
      }
    }
    
    // Check local storage for identity and past history
    try {
      const existingResidentId = localStorage.getItem(RESIDENT_ID_KEY);
      if (existingResidentId) setIsReturningUser(true);

      // Retrieve previously saved preferences if they exist
      const savedAgeGroup = localStorage.getItem(AGE_GROUP_KEY);
      const savedBarangayId = localStorage.getItem(BARANGAY_ID_KEY);
      
      if (savedAgeGroup || savedBarangayId) {
        setFormData(prev => ({ 
          ...prev, 
          ...(savedAgeGroup && { age_group: savedAgeGroup }),
          ...(savedBarangayId && { barangay_id: savedBarangayId })
        }));
      }
    } catch (error) {
      console.error("Could not access local storage:", error);
      // Optionally, inform the user that their progress won't be saved across sessions.
    }
    fetchBarangays();
  }, []);

  // --- CAPTCHA Verification ---
  const handleVerifyCaptcha = (e) => {
    e.preventDefault();
    if (parseInt(captchaInput) === (captchaNum1 + captchaNum2)) {
      setSyncStep('manual'); // Human verified, proceed to form!
    } else {
      setCaptchaError('Incorrect answer. Please try again.');
      setCaptchaInput('');
      // Generate a new math problem on failure
      setCaptchaNum1(Math.floor(Math.random() * 10) + 1);
      setCaptchaNum2(Math.floor(Math.random() * 10) + 1);
    }
  };

  // Handle Supabase Submission & Rolling Average Math
  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!formData.steps || !formData.barangay_id) return;
    
    setIsSubmitting(true);

    try {
      let currentResidentId = localStorage.getItem(RESIDENT_ID_KEY);

      // Safety check in case previous bugs saved "undefined" or "null" as a string
      if (currentResidentId === "undefined" || currentResidentId === "null") {
        currentResidentId = null;
      }

      // Save the selected age group to local storage for their next visit
      localStorage.setItem(AGE_GROUP_KEY, formData.age_group);
      localStorage.setItem(BARANGAY_ID_KEY, formData.barangay_id);

      // Variables to send to database
      let dbSteps = parseInt(formData.steps) || 0;
      // Replace: let dbMins = parseInt(formData.mins) || 0;
      
      const walk = parseInt(formData.walkMins) || 0;
      const run = parseInt(formData.runMins) || 0;
      const bike = parseInt(formData.bikeMins) || 0;
      const other = parseInt(formData.otherMins) || 0;
      let dbMins = walk + run + bike + other;

      // ==========================================
      // DATABASE SYNC LOGIC
      // ==========================================

      // ==========================================
      // DATABASE SYNC LOGIC (BLIND UPSERT DESIGN)
      // ==========================================

      // 1. IDENTITY UPSERT
      // Generate ID client-side if it doesn't exist to avoid SELECT queries
      if (!currentResidentId) {
        currentResidentId = crypto.randomUUID();
        localStorage.setItem(RESIDENT_ID_KEY, currentResidentId); 
      }

      // Perform a Blind Upsert (Update if exists, Insert if it doesn't)
      const { error: residentError } = await supabase
        .from('residents')
        .upsert({
          id: currentResidentId,
          barangay_id: parseInt(formData.barangay_id),
          age_group: formData.age_group,
          gender_at_birth: formData.gender,
          primary_source: 'WEB_PORTAL'
        }, { onConflict: 'id' }); // No .select() chained here!

      if (residentError) throw residentError;
           
      // 2. ACTIVITY LOG UPSERT
      // Retrieve or generate the single log ID for this device
      let currentLogId = localStorage.getItem(ACTIVITY_LOG_ID_KEY);
      if (!currentLogId) {
        currentLogId = crypto.randomUUID();
        localStorage.setItem(ACTIVITY_LOG_ID_KEY, currentLogId);
      }

      // Perform Blind Upsert for the Activity Log
      const { error: logError } = await supabase
        .from('activity_logs')
        .upsert({
          id: currentLogId,
          resident_id: currentResidentId,
          source_type: 'WEB_PORTAL',
          daily_steps: dbSteps,
          weekly_exercise_mins: dbMins,
          walking_mins_weekly: walk,   
          running_mins_weekly: run,    
          biking_mins_weekly: bike,    
          other_sports_mins_weekly: other, 
          local_timestamp: new Date().toISOString(),
          is_synced: true
        }, { onConflict: 'id' }); // No .select() chained here!

      if (logError) throw logError;

      // Success transition
      setSyncStep('success');
      
    } catch (error) {
      console.error("Submission Error:", error);
      if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'SecurityError')) {
        alert("Could not save your data. Your browser's local storage might be full or disabled. Please check your browser settings.");
      } else {
        // Include the actual error message so it can be read on mobile screens
        alert(`Something went wrong saving your data: ${error.message || JSON.stringify(error)}. Please try again.`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadAccept = () => {
    // Replace this URL with your actual public Google Cloud Storage link
    const apkUrl = 'https://drive.google.com/file/d/1s3UJNLsIHm9G2yQ0ze5Da9khJDq6ht2G/view?usp=sharing';
    
    // Create an invisible anchor tag to trigger the browser's download manager
    const link = document.createElement('a');
    link.href = apkUrl;
    link.setAttribute('download', 'shi_sync.apk'); // Suggests the filename
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Go back to the main menu after initiating the download
    setSyncStep('choice');
  };

  const simulateStravaSync = () => {
    setSyncStep('strava-loading');
    setTimeout(() => setSyncStep('success'), 2000);
  };

  const getSelectedBarangayName = () => {
    const bgy = barangays.find(b => b.id.toString() === formData.barangay_id);
    return bgy ? bgy.name : 'Your Barangay';
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Dynamic Header */}
      <header className="bg-white px-6 pt-8 pb-6 rounded-b-3xl shadow-sm border-b border-slate-100">
        <div className="max-w-md mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-[#1E40AF] text-white p-1.5 rounded-lg border border-blue-800">
              <span className="font-black text-xs">QC</span>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">Resident Portal</h1>
              <p className="text-slate-500 text-sm font-medium">Self-service Input</p>
            </div>
          </div>
        </div>
      </header>

      <main className="px-6 py-8 max-w-md mx-auto">
        
        {/* STEP 1: CHOICE */}
        {syncStep === 'choice' && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-[#1E40AF] p-6 rounded-3xl text-white shadow-xl shadow-blue-900/20 relative overflow-hidden">
               <div className="relative z-10">
                  <h2 className="text-lg font-bold mb-2">
                    {isReturningUser ? "Welcome back to SmartHealthIndex!" : "Help QC Build Better Parks"}
                  </h2>
                  <p className="text-blue-100 text-xs leading-relaxed">
                    {isReturningUser 
                      ? "Thank you for continuing to track your activity. Your consistent logs help build a highly accurate baseline for your Barangay." 
                      : "By sharing your activity data, you help urban planners decide where to put new jogging paths and fitness equipment in your Barangay."}
                  </p>
               </div>
               <div className="absolute -right-4 -bottom-4 opacity-10">
                  <Zap className="w-32 h-32" />
               </div>
            </div>

            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest px-2">How would you like to contribute?</h3>
            
            <button 
              onClick={() => setSyncStep('gadget-download')}
              className="w-full bg-white p-5 rounded-3xl border-2 border-slate-100 shadow-sm flex items-center gap-4 hover:border-[#1E40AF] transition-all group"
            >
              <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-[#1E40AF] group-hover:bg-[#1E40AF] group-hover:text-white transition-colors">
                <Activity className="w-8 h-8" />
              </div>
              <div className="text-left flex-grow">
                <h4 className="font-bold text-slate-900">Connect Gadget</h4>
                <p className="text-xs text-slate-500">Download the SHI-Sync App (Android only)</p>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-300" />
            </button>

            <button 
                  onClick={() => {
                    setCaptchaNum1(Math.floor(Math.random() * 10) + 1);
                    setCaptchaNum2(Math.floor(Math.random() * 10) + 1);
                    setCaptchaInput('');
                    setCaptchaError('');
                    setSyncStep('captcha');
                  }}
                  className="w-full bg-white p-5 rounded-3xl border-2 border-slate-100 shadow-sm flex items-center gap-4 hover:border-[#1E40AF] transition-all group"
                >
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <PlusCircle className="w-8 h-8" />
              </div>
              <div className="text-left flex-grow">
                <h4 className="font-bold text-slate-900">Manual Entry</h4>
                <p className="text-xs text-slate-500">Input your steps today</p>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-300" />
            </button>

            <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
               <ShieldCheck className="w-5 h-5 text-slate-400 mt-0.5" />
               <p className="text-[10px] text-slate-500 leading-tight">
                  Your privacy matters. We only collect anonymized activity counts tied to your Barangay. No names or GPS routes are stored. (RA 10173 Compliant)
               </p>
            </div>
          </div>
        )}

        {/* STEP 1.5: CAPTCHA SECURITY CHECK */}
        {syncStep === 'captcha' && (
          <section className="bg-white rounded-3xl shadow-sm p-6 border border-slate-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-blue-50 text-[#1E40AF] rounded-full flex items-center justify-center mb-2">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-black text-slate-900">Security Check</h2>
              <p className="text-sm font-medium text-slate-500">
                Please solve this simple math problem to verify you are human.
              </p>
              
              <form onSubmit={handleVerifyCaptcha} className="w-full space-y-4 mt-4">
                {captchaError && (
                  <div className="bg-rose-50 text-rose-600 p-3 rounded-xl text-xs font-bold border border-rose-100">
                    {captchaError}
                  </div>
                )}
                
                <div className="flex items-center justify-center gap-4 text-3xl font-black text-slate-900 bg-slate-50 py-6 rounded-2xl border-2 border-slate-100">
                  <span>{captchaNum1}</span>
                  <span className="text-slate-400">+</span>
                  <span>{captchaNum2}</span>
                  <span className="text-slate-400">=</span>
                  <input
                    type="number"
                    required
                    value={captchaInput}
                    onChange={(e) => setCaptchaInput(e.target.value)}
                    className="w-20 p-2 bg-white border-2 border-slate-200 rounded-xl text-center focus:border-[#1E40AF] outline-none transition-all shadow-inner"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setSyncStep('choice')}
                    className="flex-1 py-4 bg-slate-50 text-slate-600 font-bold rounded-2xl hover:bg-slate-100 transition-colors"
                  >
                    CANCEL
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-4 bg-[#1E40AF] text-white font-black rounded-2xl shadow-lg shadow-blue-900/20 hover:bg-blue-800 transition-all active:scale-95"
                  >
                    VERIFY
                  </button>
                </div>
              </form>
            </div>
          </section>
        )}

        {/* STEP 2: MANUAL FORM */}
        {syncStep === 'manual' && (
          <div className="animate-in slide-in-from-right-4 duration-300">
            <button onClick={() => setSyncStep('choice')} className="text-xs font-bold text-slate-400 mb-6 flex items-center gap-1 hover:text-slate-700">← Go Back</button>
            <form onSubmit={handleManualSubmit} className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 space-y-6">
              
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black text-slate-900">Manual Entry</h2>
                {isReturningUser && (
                  <span className="flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-widest">
                    <UserCheck className="w-3 h-3" /> Linked
                  </span>
                )}
              </div>

              
              <div className="space-y-4">
                {/* Full-width Barangay */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Barangay
                  </label>
                  <select 
                    value={formData.barangay_id}
                    onChange={(e) => setFormData({...formData, barangay_id: e.target.value})}
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 font-bold text-sm outline-none focus:border-[#1E40AF] transition-all"
                  >
                    {barangays.length === 0 && <option>Loading...</option>}
                    {barangays.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                {/* 2-Column Grid for Age and Gender */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                      <User className="w-3 h-3" /> Age Group
                    </label>
                    <select 
                      value={formData.age_group}
                      onChange={(e) => setFormData({...formData, age_group: e.target.value})}
                      className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 font-bold text-sm outline-none focus:border-[#1E40AF] transition-all"
                    >
                      <option value="18-24">18-24 yrs</option>
                      <option value="25-34">25-34 yrs</option>
                      <option value="35-44">35-44 yrs</option>
                      <option value="45-54">45-54 yrs</option>
                      <option value="55-64">55-64 yrs</option>
                      <option value="65+">65+ yrs</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                      <User className="w-3 h-3" /> Gender
                    </label>
                    <select 
                      value={formData.gender}
                      onChange={(e) => setFormData({...formData, gender: e.target.value})}
                      className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 font-bold text-sm outline-none focus:border-[#1E40AF] transition-all"
                    >
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Avg. Daily Steps
                </label>
                <input 
                  type="number" 
                  required
                  value={formData.steps}
                  onChange={(e) => setFormData({...formData, steps: e.target.value})}
                  placeholder="e.g. 7500"
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 font-black text-2xl outline-none focus:border-[#1E40AF] transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Weekly Exercise Breakdown (Mins)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input 
                    type="number" 
                    value={formData.walkMins}
                    onChange={(e) => setFormData({...formData, walkMins: e.target.value})}
                    placeholder="Walking"
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 font-black text-lg outline-none focus:border-[#1E40AF] transition-all placeholder:text-sm placeholder:font-bold"
                  />
                  <input 
                    type="number" 
                    value={formData.runMins}
                    onChange={(e) => setFormData({...formData, runMins: e.target.value})}
                    placeholder="Running"
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 font-black text-lg outline-none focus:border-[#1E40AF] transition-all placeholder:text-sm placeholder:font-bold"
                  />
                  <input 
                    type="number" 
                    value={formData.bikeMins}
                    onChange={(e) => setFormData({...formData, bikeMins: e.target.value})}
                    placeholder="Biking"
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 font-black text-lg outline-none focus:border-[#1E40AF] transition-all placeholder:text-sm placeholder:font-bold"
                  />
                  <input 
                    type="number" 
                    value={formData.otherMins}
                    onChange={(e) => setFormData({...formData, otherMins: e.target.value})}
                    placeholder="Other"
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 font-black text-lg outline-none focus:border-[#1E40AF] transition-all placeholder:text-sm placeholder:font-bold"
                  />
                </div>
                <p className="text-[10px] text-slate-400 italic px-1 mt-2">
                  Your estimated weekly intentional physical activity total per category.
                </p>
              </div>

              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 bg-[#1E40AF] text-white rounded-2xl font-black shadow-lg shadow-blue-900/20 hover:bg-blue-800 active:scale-95 transition-all flex items-center justify-center disabled:opacity-70 disabled:active:scale-100"
              >
                {isSubmitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin mr-2" /> COMPUTING & SAVING...</>
                ) : (
                  'SUBMIT TO DATABASE'
                )}
              </button>
            </form>
          </div>
        )}

        {/* STEP 2: GADGET DOWNLOAD PROMPT */}
        {syncStep === 'gadget-download' && (
          <div className="text-center py-6 animate-in fade-in duration-500 max-w-sm mx-auto">
            <div className="w-20 h-20 bg-blue-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Activity className="w-10 h-10 text-[#1E40AF]" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-4">App Required</h2>
            <p className="text-slate-500 text-sm mb-6 px-4">
              To automatically sync your gadget, you need to download and install the secure SHI-Sync application for Android.
            </p>
            
            <div className="flex flex-col gap-3 mb-8">
              <button 
                onClick={handleDownloadAccept}
                className="w-full py-4 bg-[#1E40AF] text-white rounded-2xl font-black shadow-lg shadow-blue-900/20 active:scale-95 transition-all"
              >
                ACCEPT & DOWNLOAD
              </button>
              
              <button 
                onClick={() => setSyncStep('choice')}
                className="w-full py-4 bg-white text-slate-500 border-2 border-slate-200 rounded-2xl font-black hover:bg-slate-50 active:scale-95 transition-all"
              >
                REJECT
              </button>
            </div>

            {/* INSTRUCTION BOX */}
            <div className="bg-slate-50 rounded-2xl p-5 text-left border border-slate-100">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                How to Install & Uninstall
              </h4>
              
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-black text-slate-700 mb-1">INSTALLATION</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    1. Tap Download and open the <strong>shi_sync.apk</strong> file.<br/>
                    2. If prompted, allow your browser to <strong>"Install Unknown Apps"</strong>.<br/>
                    3. Tap Install. Once finished, open the app, then Read and Accept the permissions.
                  </p>
                </div>

                <div>
                  <p className="text-[11px] font-black text-slate-700 mb-1">UNINSTALLATION</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Long-press the <strong>SHI-Sync</strong> icon on your home screen, tap the <strong>(i) info</strong> button or "Uninstall," and confirm.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUCCESS STATE */}
        {syncStep === 'success' && (
          <div className="text-center py-10 animate-in zoom-in duration-300">
            <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-12 h-12 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">Thank You!</h2>
            <p className="text-slate-500 text-sm mb-8">
              Your contribution has been securely synced to the Quezon City database.
            </p>
            
            <button 
              onClick={() => {
                setFormData(prev => ({ 
                  ...prev, 
                  steps: '', 
                  walkMins: '', 
                  runMins: '', 
                  bikeMins: '', 
                  otherMins: '' 
                })); // Keep user's selections, clear inputs
                setSyncStep('choice');
              }}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black active:scale-95 transition-all"
            >
              DONE
            </button>
          </div>
        )}
      </main>
    </div>
  );
}