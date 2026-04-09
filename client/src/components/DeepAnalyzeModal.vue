<template>
    <div v-if="isOpen" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
        <div class="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <!-- Header -->
            <div class="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white">
                <div class="flex items-center gap-4">
                    <div class="bg-slate-900 text-white w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold shadow-lg">
                        {{ analysis?.score || 0 }}
                    </div>
                    <div>
                        <h2 class="text-xl font-bold text-slate-900">{{ job?.position }}</h2>
                        <p class="text-xs text-slate-500 font-semibold uppercase tracking-widest">{{ job?.company }} • Compatibility Index</p>
                    </div>
                </div>
                <button type="button" @click="$emit('close')" class="p-2 hover:bg-slate-50 rounded-full transition-all text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            
            <!-- Content -->
            <div class="p-8 overflow-y-auto space-y-8">
                <!-- Score Bar -->
                <div class="space-y-3">
                    <div class="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                        <span>Match Potential</span>
                        <span>{{ analysis?.score || 0 }}%</span>
                    </div>
                    <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div class="h-full bg-slate-900 transition-all duration-1000 ease-out" :style="{ width: (analysis?.score || 0) + '%' }"></div>
                    </div>
                </div>

                <!-- Summary Section -->
                <div class="space-y-4">
                    <div class="flex items-center gap-2 text-slate-900">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        <h3 class="text-xs font-bold uppercase tracking-widest text-slate-400">Executive Summary</h3>
                    </div>
                    <p class="text-slate-700 leading-relaxed font-medium bg-slate-50 p-6 rounded-xl border border-slate-100">
                        {{ analysis?.summary || 'Generating summary...' }}
                    </p>
                </div>

                <!-- Reasons Section -->
                <div class="space-y-4">
                    <div class="flex items-center gap-2 text-slate-900">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                        <h3 class="text-xs font-bold uppercase tracking-widest text-slate-400">Analysis Breakdown</h3>
                    </div>
                    <ul class="space-y-3">
                        <li v-for="(reason, idx) in analysis?.reasons" :key="idx" class="flex items-start gap-4 p-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-all">
                            <div class="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-slate-900"></div>
                            <span class="text-sm text-slate-600 font-medium">{{ reason }}</span>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Footer -->
            <div class="px-8 py-6 border-t border-slate-100 bg-slate-50 flex justify-end">
                <a :href="job?.jobUrl" target="_blank" class="btn-primary px-8 py-3 text-sm font-bold shadow-lg shadow-slate-900/20">
                    Apply for Role
                </a>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">


defineProps({
    isOpen: Boolean,
    job: Object as () => any,
    analysis: Object as () => { summary: string; score: number; reasons: string[] } | null
});

defineEmits(['close']);
</script>
