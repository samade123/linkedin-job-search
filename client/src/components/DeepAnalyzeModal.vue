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
                        <div class="flex items-center gap-2 mt-0.5">
                            <p class="text-xs text-slate-500 font-semibold uppercase tracking-widest">{{ job?.company }} • Compatibility Index</p>
                            <span v-if="hasFailures" class="bg-amber-100 text-amber-700 text-[9px] font-bold uppercase px-2 py-0.5 rounded tracking-tighter flex items-center gap-1">
                                <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                Signal Degraded
                            </span>
                        </div>
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
                <!-- Search Criteria (Context) -->
                <div v-if="criteria" class="p-6 bg-slate-100/50 rounded-xl border border-slate-200/60 mb-6">
                    <div class="flex items-center gap-2 mb-3">
                        <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <h3 class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Analysis Criteria</h3>
                    </div>
                    <p class="text-xs text-slate-600 font-medium leading-relaxed mb-4">
                        {{ criteria.summary }}
                    </p>
                    <div v-if="criteria.titles?.length" class="flex flex-wrap gap-2">
                        <span v-for="t in criteria.titles" :key="t" class="bg-white border border-slate-200 text-slate-500 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-tight shadow-sm">
                            {{ t }}
                        </span>
                    </div>
                </div>

                <!-- Loading State -->
                <div v-if="!analysis" class="flex flex-col items-center justify-center py-12 space-y-4">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
                    <p class="text-slate-500 font-medium">Sequential AI Analysis in Progress...</p>
                    <p class="text-xs text-slate-400">Processing time may vary for local models (up to 60s)</p>
                </div>

                <template v-else>
                    <!-- Score Bar -->
                    <div class="space-y-3">
                        <div class="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                            <span>Match Potential</span>
                            <span>{{ analysis.score }}%</span>
                        </div>
                        <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div class="h-full bg-slate-900 transition-all duration-1000 ease-out" :style="{ width: analysis.score + '%' }"></div>
                        </div>
                    </div>

                    <!-- Summary Section -->
                    <div class="space-y-4">
                        <div class="flex items-center justify-between text-slate-900">
                            <div class="flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                <h3 class="text-xs font-bold uppercase tracking-widest text-slate-400">Executive Summary</h3>
                            </div>
                            <button @click="onReload" :disabled="isReloadingSummary" class="p-1.5 hover:bg-slate-100 rounded-lg transition-all text-slate-400 hover:text-slate-900" title="Regenerate Summary">
                                <svg :class="['w-3.5 h-3.5', isReloadingSummary ? 'animate-spin' : '']" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m0 0H15"></path>
                                </svg>
                            </button>
                        </div>
                        <div :class="['relative rounded-xl border p-6 transition-all', isReloadingSummary ? 'opacity-50 grayscale' : '', isSummaryFailed ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100']">
                            <div v-if="isSummaryFailed" class="absolute top-2 right-2 flex items-center gap-1.5 text-[9px] font-bold text-amber-600 uppercase">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                Pass Failed
                            </div>
                            <p class="text-slate-700 leading-relaxed font-medium">
                                {{ analysis.summary }}
                            </p>
                        </div>
                    </div>

                    <!-- Reasons Section -->
                    <div class="space-y-4">
                        <div class="flex items-center justify-between text-slate-900">
                            <div class="flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                                <h3 class="text-xs font-bold uppercase tracking-widest text-slate-400">Analysis Breakdown</h3>
                            </div>
                            <button @click="onReloadRating" :disabled="isReloadingRating" class="p-1.5 hover:bg-slate-100 rounded-lg transition-all text-slate-400 hover:text-slate-900" title="Regenerate Analysis">
                                <svg :class="['w-3.5 h-3.5', isReloadingRating ? 'animate-spin' : '']" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m0 0H15"></path>
                                </svg>
                            </button>
                        </div>
                        <ul :class="['space-y-3 transition-opacity', isReloadingRating ? 'opacity-50' : '']">
                            <li v-for="(reason, idx) in analysis.reasons" :key="idx" class="flex items-start gap-4 p-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-all">
                                <div class="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-slate-900"></div>
                                <span class="text-sm text-slate-600 font-medium" v-html="formatReport(reason)"></span>
                            </li>
                        </ul>
                    </div>

                    <!-- Key Quotes Section -->
                    <div v-if="analysis.quotes" class="space-y-4">
                        <div class="flex items-center justify-between text-slate-900">
                            <div class="flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path></svg>
                                <h3 class="text-xs font-bold uppercase tracking-widest text-slate-400">Key Quotes</h3>
                            </div>
                            <button @click="onReloadQuotes" :disabled="isReloadingQuotes" class="p-1.5 hover:bg-slate-100 rounded-lg transition-all text-slate-400 hover:text-slate-900" title="Regenerate Quotes">
                                <svg :class="['w-3.5 h-3.5', isReloadingQuotes ? 'animate-spin' : '']" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m0 0H15"></path>
                                </svg>
                            </button>
                        </div>
                        <div :class="['space-y-4 transition-opacity', isReloadingQuotes ? 'opacity-50' : '']">
                            <blockquote v-for="(quote, idx) in analysis.quotes" :key="idx" class="border-l-4 border-slate-200 pl-4 py-1">
                                <p class="text-sm italic text-slate-600 font-medium leading-relaxed">
                                    "{{ quote }}"
                                </p>
                            </blockquote>
                        </div>
                    </div>

                    <!-- Culture & Benefits Section -->
                    <div v-if="analysis.culture" class="space-y-4">
                        <div class="flex items-center justify-between text-slate-900">
                            <div class="flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z"></path></svg>
                                <h3 class="text-xs font-bold uppercase tracking-widest text-slate-400">Culture & Benefits</h3>
                            </div>
                            <button @click="onReloadCulture" :disabled="isReloadingCulture" class="p-1.5 hover:bg-slate-100 rounded-lg transition-all text-slate-400 hover:text-slate-900" title="Regenerate Culture">
                                <svg :class="['w-3.5 h-3.5', isReloadingCulture ? 'animate-spin' : '']" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m0 0H15"></path>
                                </svg>
                            </button>
                        </div>
                        <p :class="['text-slate-700 leading-relaxed font-medium bg-slate-50 p-6 rounded-xl border border-slate-100 italic quote-style transition-opacity', isReloadingCulture ? 'opacity-50' : '']" v-html="formatReport(analysis.culture)"></p>
                    </div>

                    <!-- Pros & Cons Grid -->
                    <div v-if="analysis.pros || analysis.cons" class="space-y-4">
                        <div class="flex items-center justify-between text-slate-900">
                            <div class="flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                                <h3 class="text-xs font-bold uppercase tracking-widest text-slate-400">Strategic Overview</h3>
                            </div>
                            <button @click="onReloadProsCons" :disabled="isReloadingProsCons" class="p-1.5 hover:bg-slate-100 rounded-lg transition-all text-slate-400 hover:text-slate-900" title="Regenerate Pros & Cons">
                                <svg :class="['w-3.5 h-3.5', isReloadingProsCons ? 'animate-spin' : '']" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m0 0H15"></path>
                                </svg>
                            </button>
                        </div>
                        <div :class="['grid grid-cols-1 md:grid-cols-2 gap-6 transition-opacity', isReloadingProsCons ? 'opacity-50' : '']">
                            <div v-if="analysis.pros" class="space-y-4">
                                <h3 class="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600 flex items-center gap-2">
                                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                    Strategic Pros
                                </h3>
                                <ul class="space-y-2">
                                    <li v-for="(pro, idx) in analysis.pros" :key="idx" class="text-xs font-semibold text-slate-600 flex items-start gap-2">
                                        <span class="text-emerald-500 font-bold">+</span>
                                        <span v-html="formatReport(pro)"></span>
                                    </li>
                                </ul>
                            </div>
                            <div v-if="analysis.cons" class="space-y-4">
                                <h3 class="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600 flex items-center gap-2">
                                    <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                    Potential Cons
                                </h3>
                                <ul class="space-y-2">
                                    <li v-for="(con, idx) in analysis.cons" :key="idx" class="text-xs font-semibold text-slate-600 flex items-start gap-2">
                                        <span class="text-amber-500">!</span>
                                        <span v-html="formatReport(con)"></span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </template>
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
import { ref, computed } from 'vue';

const props = defineProps({
    isOpen: Boolean,
    job: Object as () => any,
    analysis: Object as () => { 
        summary: string; 
        score: number; 
        reasons: string[]; 
        culture?: string;
        pros?: string[];
        cons?: string[];
        quotes?: string[];
    } | null,
    criteria: Object as () => {
        summary: string;
        titles: string[];
    } | null
});

const emit = defineEmits([
    'close', 
    'reload-summary', 
    'reload-rating', 
    'reload-culture', 
    'reload-pros-cons', 
    'reload-quotes'
]);

const isReloadingSummary = ref(false);
const isReloadingRating = ref(false);
const isReloadingCulture = ref(false);
const isReloadingProsCons = ref(false);
const isReloadingQuotes = ref(false);

const isSummaryFailed = computed(() => {
    if (!props.analysis?.summary) return false;
    const txt = props.analysis.summary.toLowerCase();
    return txt.includes('error') || txt.includes('failed') || txt.includes('unavailable');
});

const hasFailures = computed(() => {
    if (!props.analysis) return false;
    if (isSummaryFailed.value) return true;
    if (props.analysis.reasons?.some(r => r.toLowerCase().includes('inconclusive'))) return true;
    return false;
});

const onReload = async () => {
    isReloadingSummary.value = true;
    emit('reload-summary');
    setTimeout(() => { isReloadingSummary.value = false; }, 2000);
};

const onReloadRating = async () => {
    isReloadingRating.value = true;
    emit('reload-rating');
    setTimeout(() => { isReloadingRating.value = false; }, 2000);
};

const onReloadCulture = async () => {
    isReloadingCulture.value = true;
    emit('reload-culture');
    setTimeout(() => { isReloadingCulture.value = false; }, 2000);
};

const onReloadProsCons = async () => {
    isReloadingProsCons.value = true;
    emit('reload-pros-cons');
    setTimeout(() => { isReloadingProsCons.value = false; }, 2000);
};

const onReloadQuotes = async () => {
    isReloadingQuotes.value = true;
    emit('reload-quotes');
    setTimeout(() => { isReloadingQuotes.value = false; }, 2000);
};

const formatReport = (text: string) => {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '<b class="text-slate-900">$1</b>')
        .replace(/\*(.*?)\*/g, '<i class="text-slate-500">$1</i>');
};
</script>
