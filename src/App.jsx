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

export default function ResidentApp() {
  const [syncStep, setSyncStep] = useState('choice'); // choice, manual, strava, success
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReturningUser, setIsReturningUser] = useState(false);
  
  // Database & Local States
  const [barangays, setBarangays] = useState([]);
  const [formData, setFormData] = useState({ 
    steps: '', 
    mins: '', 
    barangay_id: '',
    age_group: '25-34' // Default age group
  });

  // Initialization: Fetch Barangays & Load Local History
  useEffect(() => {
    async function fetchBarangays() {
      const { data, error } = await supabase.from('barangays').select('id, name');
      if (data && data.length > 0) {
        setBarangays(data);
        setFormData(prev => ({ ...prev, barangay_id: data[0].id.toString() }));
      }
    }
    
    // Check local storage for identity and past history
    const existingResidentId = localStorage.getItem('smarthealthindex_resident_id');
    if (existingResidentId) setIsReturningUser(true);

    // Retrieve previously saved age group if it exists
    const savedAgeGroup = localStorage.getItem('smarthealthindex_age_group');
    if (savedAgeGroup) {
      setFormData(prev => ({ ...prev, age_group: savedAgeGroup }));
    }

    fetchBarangays();
  }, []);

  // Handle Supabase Submission & Rolling Average Math
  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!formData.steps || !formData.barangay_id) return;
    
    setIsSubmitting(true);

    try {
      let currentResidentId = localStorage.getItem('smarthealthindex_resident_id');

      // Save the selected age group to local storage for their next visit
      localStorage.setItem('smarthealthindex_age_group', formData.age_group);

      // Variables to send to database
      let dbSteps = parseInt(formData.steps) || 0;
      let dbMins = parseInt(formData.mins) || 0;

      // ==========================================
      // DATABASE SYNC LOGIC
      // ==========================================

      // 1. IDENTITY CHECK: Create resident ONLY if they don't exist
      if (!currentResidentId) {
        const { data: residentData, error: residentError } = await supabase
          .from('residents')
          .insert([{
            barangay_id: parseInt(formData.barangay_id),
            age_group: formData.age_group,
            primary_source: 'WEB_PORTAL'
          }])
          .select()
          .single();

        if (residentError) throw residentError;
        
        currentResidentId = residentData.id;
        localStorage.setItem('smarthealthindex_resident_id', currentResidentId); 
      } else {
        // Update their age group just in case they changed it in the form
        await supabase
          .from('residents')
          .update({ age_group: formData.age_group })
          .eq('id', currentResidentId);
      }

      // 2. DAILY DEDUPLICATION CHECK
      const todayStrDB = new Date().toISOString().split('T')[0]; 
      const { data: existingLogs, error: checkError } = await supabase
        .from('activity_logs')
        .select('id')
        .eq('resident_id', currentResidentId)
        .gte('local_timestamp', `${todayStrDB}T00:00:00.000Z`)
        .lte('local_timestamp', `${todayStrDB}T23:59:59.999Z`);

      if (checkError) throw checkError;

      if (existingLogs && existingLogs.length > 0) {
        // SCENARIO A: Update today's existing database record
        const { error: updateError } = await supabase
          .from('activity_logs')
          .update({
            daily_steps: dbSteps,
            weekly_exercise_mins: dbMins
          })
          .eq('id', existingLogs[0].id);

        if (updateError) throw updateError;
        
      } else {
        // SCENARIO B: Insert new database record
        const { error: insertError } = await supabase
          .from('activity_logs')
          .insert([{
            resident_id: currentResidentId,
            source_type: 'WEB_PORTAL',
            daily_steps: dbSteps,
            weekly_exercise_mins: dbMins,
            local_timestamp: new Date().toISOString(),
            is_synced: true
          }]);

        if (insertError) throw insertError;
      }

      // Success transition
      setSyncStep('success');
      
    } catch (error) {
      console.error("Database Error:", error);
      alert("Something went wrong saving your data. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadAccept = () => {
    // Replace this URL with your actual public Google Cloud Storage link
    const apkUrl = 'https://drive.google.com/file/d/1et_KmtvzckZOGZ4Iod6-ViDmmIq-c4-c/view?usp=sharing';
    
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
              <h1 className="font-bold text-sm leading-none">Resident Portal</h1>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 mt-0.5">Self-service Input</p>
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
              onClick={() => setSyncStep('manual')}
              className="w-full bg-white p-5 rounded-3xl border-2 border-slate-100 shadow-sm flex items-center gap-4 hover:border-indigo-600 transition-all group"
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

              
              <div className="grid grid-cols-2 gap-4">
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
                  <Clock className="w-3 h-3" /> Avg. Weekly Exercise
                </label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={formData.mins}
                    onChange={(e) => setFormData({...formData, mins: e.target.value})}
                    placeholder="Total this week"
                    className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 font-black text-2xl outline-none focus:border-[#1E40AF] transition-all"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-slate-300 text-sm">MINS</span>
                </div>
                <p className="text-[10px] text-slate-400 italic px-1">
                  Your estimated weekly intentional physical activity total.
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
          <div className="text-center py-10 animate-in fade-in duration-500">
            <div className="w-24 h-24 bg-blue-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Activity className="w-12 h-12 text-[#1E40AF]" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-4">App Required</h2>
            <p className="text-slate-500 text-sm mb-8 px-6">
              To automatically sync your gadget, you need to download and install the secure SHI-Sync application. Do you want to download the app now?
            </p>
            
            <div className="flex flex-col gap-3">
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

            {/* BARANGAY PROGRESS */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm mb-8 text-left">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Barangay Goal Progress</p>
              <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden mb-2">
                <div className="bg-emerald-500 h-full w-[72%] rounded-full animate-pulse"></div>
              </div>
              <p className="text-xs font-bold text-slate-600">{getSelectedBarangayName()} is 72% of the way to the health baseline goal!</p>
            </div>
            
            <button 
              onClick={() => {
                setFormData({ steps: '', mins: '', barangay_id: barangays[0]?.id.toString() || '', age_group: formData.age_group });
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