<template>
    <div v-if="goal && goal.summary" class="mb-8 p-8 executive-panel border-l-8 border-slate-900 relative">
        <div class="flex items-center gap-3 mb-6">
            <div class="bg-slate-100 p-2 rounded-lg border border-slate-200">
                <svg class="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <div>
                <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-0.5">Executive Summary</h4>
                <p class="text-[10px] text-slate-600 font-medium">Strategic Search Parameters Identified</p>
            </div>
            <button @click="$emit('reload')" :disabled="loading" class="ml-auto p-1.5 hover:bg-slate-100 rounded-lg transition-all text-slate-400 hover:text-slate-900" title="Regenerate Search Goal">
                <svg :class="['w-3.5 h-3.5', loading ? 'animate-spin' : '']" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m0 0H15"></path>
                </svg>
            </button>
        </div>
        <div class="space-y-6">
            <p class="text-lg font-medium leading-relaxed text-slate-800">{{ goal.summary }}</p>
            <div v-if="goal.titles && goal.titles.length > 0" class="pt-6 border-t border-slate-100">
                <p class="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-4">Primary Target Roles</p>
                <div class="flex flex-wrap gap-2">
                    <span v-for="t in goal.titles" :key="t" class="bg-slate-900 text-white px-3 py-1.5 rounded text-xs font-semibold shadow-sm">{{ t }}</span>
                </div>
            </div>
            <div v-if="goal.relatedTitles && goal.relatedTitles.length > 0" class="pt-4">
                <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Adjacent Market Opportunities</p>
                <div class="flex flex-wrap gap-2">
                    <span v-for="t in goal.relatedTitles" :key="t" class="bg-slate-50 px-3 py-1 rounded text-[11px] font-medium border border-slate-200 text-slate-600">{{ t }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">


defineProps({
    goal: {
        type: Object as () => { summary: string; titles?: string[]; relatedTitles?: string[] } | null,
        default: null
    },
    loading: {
        type: Boolean,
        default: false
    }
});

defineEmits(['reload']);
</script>
