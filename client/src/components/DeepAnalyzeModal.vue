<template>
    <Transition name="fade">
        <div v-if="isOpen"
            class="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[150] flex items-center justify-center p-4">
            <div
                class="bg-white border border-slate-200 rounded-3xl w-full max-w-[95vw] xl:max-w-7xl shadow-2xl overflow-hidden flex flex-col h-[90vh]">

                <!-- Header -->
                <header class="px-8 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                    <div class="flex items-center gap-4">
                        <div
                            class="bg-slate-950 text-white w-12 h-12 rounded-xl flex flex-col items-center justify-center shadow-lg">
                            <span class="text-lg font-black leading-none">{{ analysis?.score || 0 }}</span>
                            <span class="text-[7px] uppercase font-bold tracking-tighter opacity-60">Match</span>
                        </div>
                        <div class="flex-1">
                            <h3 @dblclick="toggleDebug"
                                class="text-xl font-bold text-slate-900 tracking-tight leading-tight">{{ job?.position
                                || 'Deep Analysis' }}</h3>
                            <div class="flex items-center gap-3 mt-1.5">
                                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                                    {{ job?.company }} • Integration Analysis
                                </p>
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center gap-3">
                        <Transition name="slide-fade">
                            <span v-if="hasFailures"
                                class="bg-amber-50 text-amber-600 text-[9px] font-black uppercase px-3 py-1.5 rounded-lg border border-amber-100 flex items-center gap-1.5">
                                <ShieldAlert :size="12" /> Signal Degraded
                            </span>
                        </Transition>
                        <button @click="$emit('close')"
                            class="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                            <X :size="20" />
                        </button>
                    </div>
                </header>

                <!-- Content Layout -->
                <div class="flex-1 flex overflow-hidden relative">

                    <!-- LEFT PANEL: Original Listing -->
                    <section :class="[
                        'flex flex-col h-full bg-slate-50 transition-all duration-500 ease-in-out overflow-hidden border-r border-slate-200',
                        dominantSide === 'left' ? 'flex-[2.5]' : 'flex-[1] pane-compact'
                    ]">
                        <div
                            class="flex items-center justify-between px-6 py-3 bg-slate-100/50 border-b border-slate-200/60 shrink-0">
                            <div class="flex items-center gap-2">
                                <FileText :size="14" class="text-slate-400" />
                                <span class="text-[10px] font-black uppercase tracking-widest text-slate-500">Original
                                    Listing</span>
                            </div>
                            <button v-if="dominantSide === 'right'" @click="dominantSide = 'left'"
                                class="p-1.5 hover:bg-white rounded-lg transition-all text-slate-500 shadow-sm">
                                <Maximize2 :size="14" />
                            </button>
                        </div>

                        <div
                            :class="['flex-1 overflow-y-auto p-8 custom-scrollbar transition-all duration-300', dominantSide === 'right' ? 'text-xs opacity-60' : 'text-base opacity-100']">
                            <!-- DEBUG OVERLAY (Triggered by script) -->
                            <div v-if="showDebug"
                                class="mb-4 p-4 bg-slate-900 rounded-xl font-mono text-[10px] text-emerald-400 overflow-x-auto border border-emerald-500/30">
                                <div
                                    class="font-bold border-b border-emerald-500/20 pb-2 mb-2 uppercase tracking-widest">
                                    Job Object Debug Monitor</div>
                                <div class="grid grid-cols-2 gap-2">
                                    <div>AVAILABLE KEYS:</div>
                                    <div class="text-white">{{ Object.keys(job || {}).join(', ') }}</div>
                                    <div>BOARD TYPE:</div>
                                    <div class="text-white">{{ job?.boardType || 'unknown' }}</div>
                                    <div>descriptionHtml:</div>
                                    <div class="text-white">{{ job?.descriptionHtml?.length || 0 }} chars</div>
                                    <div>descriptionPlain:</div>
                                    <div class="text-white">{{ job?.descriptionPlain?.length || 0 }} chars</div>
                                    <div>HAS HTML TAGS:</div>
                                    <div class="text-white">{{ /<[a-z][\s\S]*>/i.test(effectiveDescription || "") }}</div>
                                </div>
                            </div>

                            <div class="job-html-view" v-html="effectiveDescription" />
                        </div>
                    </section>

                    <!-- RIGHT PANEL: AI Analysis -->
                    <section :class="[
                        'flex flex-col h-full bg-white transition-all duration-500 ease-in-out overflow-hidden',
                        dominantSide === 'right' ? 'flex-[2.5]' : 'flex-[1] bg-slate-50/30 pane-compact'
                    ]">
                        <div
                            class="flex items-center justify-between px-6 py-3 border-b border-slate-100 bg-white/80 backdrop-blur-md shrink-0">
                            <div class="flex items-center gap-2">
                                <Sparkles :size="14" class="text-indigo-500" />
                                <span class="text-[10px] font-black uppercase tracking-widest text-slate-500">AI
                                    Insights</span>
                            </div>
                            <button @click="dominantSide = dominantSide === 'left' ? 'right' : 'left'"
                                class="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors">
                                <component :is="dominantSide === 'left' ? Maximize2 : Minimize2" :size="14" />
                            </button>
                        </div>

                        <div
                            :class="['flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar transition-opacity duration-300', dominantSide === 'left' ? 'opacity-80' : 'opacity-100']">
                            <!-- Executive Summary -->
                            <div class="space-y-4">
                                <div class="flex items-center justify-between">
                                    <h3 class="text-xs font-black uppercase tracking-widest text-slate-900">Executive
                                        Summary</h3>
                                    <button @click="handleReload('summary')"
                                        class="p-1 hover:bg-slate-50 rounded text-slate-400 transition-colors">
                                        <RotateCw :size="12" :class="{ 'animate-spin': loadingStates.summary }" />
                                    </button>
                                </div>
                                <div :class="[
                                    'p-6 rounded-2xl border leading-relaxed text-sm font-medium transition-all',
                                    isSummaryFailed ? 'bg-amber-50 border-amber-100 text-amber-900' : 'bg-slate-50/50 border-slate-100 text-slate-700'
                                ]">
                                    <div class="prose-slate max-w-none" v-html="parsedSummary" />
                                </div>
                            </div>

                            <!-- Key Evidence -->
                            <div class="space-y-4">
                                <div class="flex items-center justify-between">
                                    <h3 class="text-xs font-black uppercase tracking-widest text-slate-900">Key Evidence
                                    </h3>
                                    <button @click="handleReload('rating')"
                                        class="p-1 hover:bg-slate-50 rounded text-slate-400 transition-colors">
                                        <RotateCw :size="12" :class="{ 'animate-spin': loadingStates.rating }" />
                                    </button>
                                </div>
                                <div class="grid gap-3">
                                    <div v-for="(reason, idx) in analysis?.reasons" :key="idx"
                                        class="flex gap-4 p-4 rounded-xl border border-slate-50 bg-white shadow-sm hover:border-slate-200 transition-all">
                                        <CheckCircle2 :size="16" class="shrink-0 text-emerald-500 mt-0.5" />
                                        <div class="text-sm text-slate-600 font-medium leading-relaxed"
                                            v-html="formatMarkdown(reason)" />
                                    </div>
                                </div>
                            </div>

                            <!-- Culture & Pros/Cons -->
                            <div :class="['grid gap-6', dominantSide === 'right' ? 'grid-cols-2' : 'grid-cols-1']">
                                <!-- Culture Section -->
                                <div v-if="analysis?.culture" class="space-y-4">
                                    <div class="flex items-center justify-between">
                                        <h3 class="text-xs font-black uppercase tracking-widest text-slate-900">Culture
                                            Fit</h3>
                                        <button @click="handleReload('culture')"
                                            class="p-1 hover:bg-slate-50 rounded text-slate-400 transition-colors">
                                            <RotateCw :size="12" :class="{ 'animate-spin': loadingStates.culture }" />
                                        </button>
                                    </div>
                                    <div class="bg-indigo-50/30 border border-indigo-100 rounded-xl p-6 italic text-sm text-slate-600 leading-relaxed font-medium"
                                        v-html="formatMarkdown(analysis.culture)" />
                                </div>

                                <!-- Pros/Cons -->
                                <div v-if="analysis?.pros || analysis?.cons" class="space-y-6">
                                    <div class="space-y-3">
                                        <div class="flex items-center justify-between">
                                            <span
                                                class="text-[10px] font-black uppercase tracking-widest text-emerald-600">Strategic
                                                Pros</span>
                                            <button @click="handleReload('prosCons')"
                                                class="p-1 hover:bg-slate-50 rounded text-slate-400 transition-colors">
                                                <RotateCw :size="12"
                                                    :class="{ 'animate-spin': loadingStates.prosCons }" />
                                            </button>
                                        </div>
                                        <div
                                            class="bg-emerald-50/30 border border-emerald-100 rounded-xl p-4 space-y-2">
                                            <div v-for="(p, i) in analysis.pros" :key="i"
                                                class="text-xs font-semibold text-emerald-800 tracking-tight flex items-start gap-2">
                                                <span class="text-emerald-500">•</span>
                                                <span v-html="formatMarkdown(p)" />
                                            </div>
                                        </div>
                                    </div>
                                    <div class="space-y-3">
                                        <span
                                            class="text-[10px] font-black uppercase tracking-widest text-amber-600">Potential
                                            Risks</span>
                                        <button @click="handleReload('prosCons')" class="hidden">Reload</button>
                                        <!-- Hidden but ensures logic mapping -->
                                        <div class="bg-amber-50/30 border border-amber-100 rounded-xl p-4 space-y-2">
                                            <div v-for="(c, i) in analysis.cons" :key="i"
                                                class="text-xs font-semibold text-amber-800 tracking-tight flex items-start gap-2">
                                                <span class="text-amber-500">!</span>
                                                <span v-html="formatMarkdown(c)" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Quotes Section -->
                            <div v-if="analysis?.quotes?.length" class="space-y-4">
                                <div class="flex items-center justify-between">
                                    <h3 class="text-xs font-black uppercase tracking-widest text-slate-900">Crucial
                                        Mentions</h3>
                                    <button @click="handleReload('quotes')"
                                        class="p-1 hover:bg-slate-50 rounded text-slate-400 transition-colors">
                                        <RotateCw :size="12" :class="{ 'animate-spin': loadingStates.quotes }" />
                                    </button>
                                </div>
                                <div class="space-y-3">
                                    <div v-for="(quote, idx) in analysis.quotes" :key="idx" class="relative group">
                                        <Quote
                                            class="absolute -left-2 -top-2 opacity-5 text-slate-950 group-hover:opacity-10 transition-opacity"
                                            :size="32" />
                                        <div
                                            class="border-l-2 border-slate-200 pl-4 py-1 italic text-sm text-slate-500 font-medium">
                                            "{{ quote }}"
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                <!-- Footer -->
                <footer class="px-8 py-4 border-t border-slate-100 bg-white flex items-center justify-between shrink-0">
                    <div class="flex items-center gap-4">
                        <template v-if="criteria?.titles">
                            <span v-for="t in criteria.titles.slice(0, 3)" :key="t"
                                class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                {{ t }}
                            </span>
                        </template>
                    </div>
                    <div class="flex items-center gap-3">
                        <a :href="job?.jobUrl" target="_blank"
                            class="flex items-center gap-2 bg-slate-900 text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200">
                            Open Original Post
                            <ExternalLink :size="14" />
                        </a>
                    </div>
                </footer>
            </div>
        </div>
    </Transition>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import { marked } from 'marked';
import {
    X,
    RotateCw,
    ShieldAlert,
    FileText,
    Sparkles,
    Maximize2,
    Minimize2,
    ExternalLink,
    CheckCircle2,
    Quote
} from 'lucide-vue-next';

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

// Dominant side state
const dominantSide = ref('left');

// Loading states for granular regenerations
const loadingStates = reactive({
    summary: false,
    rating: false,
    culture: false,
    prosCons: false,
    quotes: false
});

const showDebug = ref(false);
const toggleDebug = () => { showDebug.value = !showDebug.value; };

const effectiveDescription = computed(() => {
    return props.job?.descriptionHtml ||
        props.job?.descriptionPlain ||
        'No description available.';
});

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

const parsedSummary = computed(() => {
    if (!props.analysis?.summary) return '';
    return marked.parse(props.analysis.summary, { async: false });
});

const formatMarkdown = (text: string) => {
    if (!text) return '';
    return marked.parse(text, { async: false });
};

const handleReload = async (key: keyof typeof loadingStates) => {
    loadingStates[key] = true;

    // Emit the specific reload event
    const emitKey = key === 'prosCons' ? 'reload-pros-cons' : `reload-${key}`;
    emit(emitKey as any);

    // Smooth loading simulation if not immediately handled
    setTimeout(() => {
        loadingStates[key] = false;
    }, 2000);
};
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.slide-fade-enter-active {
    transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
    transition: all 0.2s cubic-bezier(1, 0.5, 0.8, 1);
}

.slide-fade-enter-from,
.slide-fade-leave-to {
    transform: translateX(20px);
    opacity: 0;
}

.custom-scrollbar::-webkit-scrollbar {
    width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 10px;
}

/* Injected HTML Scoping & Styling */
:deep(.job-html-view) {
    color: #475569;
    line-height: 1.7;
    word-break: break-word;
}

:deep(.job-html-view h1),
:deep(.job-html-view h2),
:deep(.job-html-view h3) {
    color: #0f172a;
    /* Slate-900 */
    font-weight: 800;
    margin-top: 2rem;
    margin-bottom: 0.75rem;
    letter-spacing: -0.025em;
}

:deep(.job-html-view h1) {
    font-size: 1.5rem;
}

:deep(.job-html-view h2) {
    font-size: 1.25rem;
}

:deep(.job-html-view h3) {
    font-size: 1.125rem;
}

:deep(.job-html-view p) {
    margin-bottom: 1.25rem;
}

:deep(.job-html-view ul),
:deep(.job-html-view ol) {
    margin-bottom: 1.5rem;
    padding-left: 1.5rem;
}

:deep(.job-html-view li) {
    margin-bottom: 0.5rem;
}

:deep(.job-html-view strong) {
    color: #0f172a;
    font-weight: 700;
}

/* Compact view overrides when sidebar is dominant */
.pane-compact :deep(.job-html-view) {
    font-size: 0.75rem;
}

.pane-compact :deep(.job-html-view h1) {
    font-size: 1rem;
}

.pane-compact :deep(.job-html-view h2),
.pane-compact :deep(.job-html-view h3) {
    font-size: 0.875rem;
    margin-top: 1rem;
}
</style>
