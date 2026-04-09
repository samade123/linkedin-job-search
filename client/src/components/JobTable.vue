<template>
    <div class="executive-panel overflow-hidden">
        <div class="overflow-x-auto">
            <table class="w-full text-left">
                <thead class="bg-slate-50 border-b border-slate-200">
                    <tr>
                        <th class="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            <div class="flex items-center justify-between gap-4">
                                <span>Professional Role</span>
                                <div class="flex items-center gap-3" :style="{ visibility: showStrictToggle ? 'visible' : 'hidden' }">
                                    <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Precision Filter</span>
                                    <button type="button" @click="$emit('update:strictMode', !strictMode)" :class="['w-7 h-4 rounded-full relative transition-all focus:outline-none', strictMode ? 'bg-slate-900' : 'bg-slate-300']">
                                        <div :class="['absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all', strictMode ? 'left-3.5' : 'left-0.5']"></div>
                                    </button>
                                </div>
                            </div>
                        </th>
                        <th class="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">Organization</th>
                        <th class="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">Locality</th>
                        <th v-if="showDeepFind" class="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">Intelligence</th>
                        <th class="px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">Reference</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 text-sm">
                    <tr v-if="!jobs || jobs.length === 0">
                        <td colspan="4" class="px-6 py-12 text-center text-slate-400">
                            {{ emptyMessage }}
                        </td>
                    </tr>
                    <tr v-for="(job, index) in jobs" :key="index" :class="['hover:bg-slate-50 transition-colors', (!job.isVetted && isTopPicksTab) ? 'opacity-60 bg-slate-100/30' : '']">
                        <td class="px-6 py-4">
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-slate-900">{{ job.position }}</span>
                                <span v-if="job.isVetted" class="text-[8px] bg-slate-900 text-white px-2 py-0.5 rounded font-bold uppercase tracking-widest">Qualified</span>
                            </div>
                            <div class="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-wider">{{ job.agoTime || '' }}</div>
                        </td>
                        <td class="px-6 py-4 text-slate-600 font-semibold uppercase text-xs">{{ job.company }}</td>
                        <td class="px-6 py-4">
                            <span class="text-slate-700 text-xs font-bold border-b border-slate-200">{{ job.location }}</span>
                        </td>
                        <td v-if="showDeepFind" class="px-6 py-4">
                            <button @click="$emit('deep-find', job)" class="flex items-center gap-2 text-slate-900 font-bold text-[10px] uppercase tracking-widest hover:text-slate-600 transition-colors">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                                Deep Find
                            </button>
                        </td>
                        <td class="px-6 py-4 text-right">
                            <a :href="job.jobUrl" target="_blank" class="inline-flex items-center justify-center bg-white border border-slate-300 px-4 py-1.5 rounded text-[11px] font-bold text-slate-800 hover:bg-slate-50 transition-all">Review Role</a>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>

<script setup lang="ts">


defineProps({
    jobs: { type: Array as () => any[], required: true },
    emptyMessage: { type: String, default: "No jobs found." },
    strictMode: { type: Boolean, default: true },
    showStrictToggle: { type: Boolean, default: false },
    isTopPicksTab: { type: Boolean, default: false },
    showDeepFind: { type: Boolean, default: false },
});

defineEmits(['update:strictMode', 'deep-find']);
</script>
