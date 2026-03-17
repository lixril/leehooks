import Link from 'next/link';
import { Rocket, ShieldCheck, Zap, ArrowRight, Github } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="relative flex flex-col items-center justify-center flex-1 px-4 py-24 text-center overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-violet-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/10 blur-[120px]" />
      </div>

      <div className="max-w-5xl mx-auto z-10">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 text-sm font-semibold text-violet-600 rounded-full bg-violet-50 dark:bg-violet-950/30 dark:text-violet-400 border border-violet-100 dark:border-violet-900/50 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
          </span>
          Production Ready for React 19
        </div>

        <h1 className="mb-8 text-6xl font-black tracking-tight sm:text-8xl lg:text-9xl animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-100">
          <span className="bg-clip-text text-transparent bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 dark:from-violet-400 dark:via-purple-400 dark:to-fuchsia-400">
            leehooks
          </span>
        </h1>

        <p className="mb-12 text-xl sm:text-2xl text-slate-600 dark:text-slate-400 max-w-3xl mx-auto leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
          The high-performance hook library for modern React. 
          Built by <span className="text-violet-600 dark:text-violet-400 font-semibold">lixril team</span> to empower your applications with type-safety and speed.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-300">
          <Link
            href="/docs"
            className="group flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-violet-600 dark:bg-violet-500 rounded-xl hover:bg-violet-700 dark:hover:bg-violet-600 transition-colors shadow-md shadow-violet-500/10"
          >
            Start Building
            <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
          
          <div className="flex items-center gap-3 px-5 py-3 font-mono text-sm bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-slate-400 select-none">$</span>
            <span className="text-slate-700 dark:text-slate-300">npm i @lixril/leehooks</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-500">
          <div className="group p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <div className="w-10 h-10 mb-6 flex items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
              <Zap size={20} />
            </div>
            <h3 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">Blazing Fast</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Zero overhead hooks optimized for React 19 concurrent features. 
            </p>
          </div>
          
          <div className="group p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <div className="w-10 h-10 mb-6 flex items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
              <ShieldCheck size={20} />
            </div>
            <h3 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">Type Strict</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Precision-engineered TypeScript types for bulletproof state management.
            </p>
          </div>

          <div className="group p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <div className="w-10 h-10 mb-6 flex items-center justify-center rounded-xl bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-600 dark:text-fuchsia-400">
              <Rocket size={20} />
            </div>
            <h3 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">Modern Core</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Designed from the ground up for the future of React development.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
