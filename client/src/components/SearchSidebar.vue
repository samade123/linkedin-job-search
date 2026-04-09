<template>
    <aside class="lg:col-span-4 space-y-6">
        <div class="executive-panel p-6">
            <h3 class="text-sm font-bold mb-5 flex items-center gap-2 text-slate-900 border-b border-slate-100 pb-3">
                <svg class="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                Search Parameters
            </h3>
            <form @submit.prevent="submitSearch" class="space-y-5">
                <div class="space-y-1.5">
                    <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Key Terms</label>
                    <input type="text" v-model="form.keyword" required class="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-1 focus:ring-slate-900 outline-none transition-all">
                </div>
                <!-- Country & Location side by side -->
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-1.5">
                        <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Country (AI Filter)</label>
                        <input type="text" v-model="form.targetCountry" placeholder="e.g. USA" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-1 focus:ring-slate-900 outline-none transition-all">
                    </div>
                    <div class="space-y-1.5">
                        <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Keyword Loc</label>
                        <input type="text" v-model="form.location" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-1 focus:ring-slate-900 outline-none transition-all">
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-1.5">
                        <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Fetch Count</label>
                        <input type="number" v-model="form.limit" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-1 focus:ring-slate-900 outline-none transition-all">
                    </div>
                    <div class="space-y-1.5">
                        <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Timeframe</label>
                        <select v-model="form.dateSincePosted" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-1 focus:ring-slate-900 outline-none transition-all">
                            <option value="past Week">Past Week</option>
                            <option value="24hr">Past 24H</option>
                            <option value="past Month">Past Month</option>
                            <option value="">Anytime</option>
                        </select>
                    </div>
                </div>
                <div class="space-y-1.5">
                    <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Seniority</label>
                    <select v-model="form.experienceLevel" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-1 focus:ring-slate-900 outline-none transition-all">
                        <option value="">Any</option>
                        <option value="internship">Internship</option>
                        <option value="entry level">Entry Level</option>
                        <option value="associate">Associate</option>
                        <option value="senior">Senior</option>
                        <option value="director">Director</option>
                    </select>
                </div>
                <button type="submit" :disabled="loading" class="w-full btn-primary py-2.5 text-sm font-bold flex items-center justify-center gap-2 mt-4">
                    <span>Execute Search</span>
                </button>
            </form>
        </div>

        <div v-if="loading" class="executive-panel p-4 border-l-4 border-slate-900 flex items-center gap-3">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-900"></div>
            <span class="text-xs font-semibold text-slate-600">{{ statusText }}</span>
        </div>
    </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits(['execute-search']);

const loading = ref(false);
const statusText = ref("");

const form = ref({
    keyword: "Commercial Manager",
    location: "London",
    targetCountry: "United Kingdom",
    limit: 50,
    dateSincePosted: "past Week",
    experienceLevel: "associate"
});

const submitSearch = () => {
    emit('execute-search', form.value, (isLoading: boolean, text: string) => {
        loading.value = isLoading;
        statusText.value = text;
    });
};
</script>
