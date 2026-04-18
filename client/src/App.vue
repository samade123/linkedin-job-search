<template>
    <div class="min-h-screen py-8">
        <div class="max-w-6xl mx-auto px-4">
            <!-- Header -->
            <header class="flex items-center justify-between mb-10 border-b border-slate-200 pb-8">
                <div>
                    <h1 class="text-3xl font-bold text-slate-900 tracking-tight">Career Intelligence Dashboard</h1>
                    <p class="text-slate-500 text-sm mt-1">Professional Job Matching & Strategic Insights</p>
                </div>
                <div class="flex items-center space-x-3">
                    <button v-if="(activeTab === 'linkedin' ? linkedinData.allJobs : boardData.allJobs).length > 0"
                            @click="exportCsv"
                            class="flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 transition-all border border-slate-200">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span>Download Report</span>
                    </button>
                    <button @click="isSettingsOpen = true" class="p-2.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition-all text-slate-500" title="Configuration">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                </div>
            </header>

            <div class="mb-8 border-b border-slate-200">
                <div class="flex space-x-8">
                    <button @click="activeTab = 'linkedin'" :class="['pb-3 text-sm font-bold border-b-2 transition-all', activeTab === 'linkedin' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700']">LinkedIn Network</button>
                    <button @click="activeTab = 'boards'" :class="['pb-3 text-sm font-bold border-b-2 transition-all', activeTab === 'boards' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700']">Direct Job Boards</button>
                </div>
            </div>

            <!-- LinkedIn View -->
            <div v-show="activeTab === 'linkedin'" class="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <SearchSidebar @execute-search="executeLinkedInSearch" />
                <main class="lg:col-span-8 space-y-8">
                    <SearchGoalCard :goal="linkedinData.goal" />
                    
                    <div class="flex gap-6 border-b border-slate-200 mb-6 items-center justify-between">
                        <div class="flex gap-8">
                            <button @click="linkedinActiveResultsTab = 'topPicks'" :class="['pb-3 text-sm font-bold flex items-center gap-2 transition-all', linkedinActiveResultsTab === 'topPicks' ? 'tab-active' : 'text-slate-400 hover:text-slate-600']">
                                Target Matches <span class="bg-slate-900 text-white px-2 py-0.5 rounded text-[10px]">{{ linkedinStrictCount }}</span>
                            </button>
                            <button @click="linkedinActiveResultsTab = 'allJobs'" :class="['pb-3 text-sm font-bold flex items-center gap-2 transition-all', linkedinActiveResultsTab === 'allJobs' ? 'tab-active' : 'text-slate-400 hover:text-slate-600']">
                                Raw Results <span class="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-[10px]">{{ linkedinData.allJobs.length }}</span>
                            </button>
                        </div>
                    </div>

                    <JobTable 
                        :jobs="linkedinJobs" 
                        :strictMode="linkedinStrictMode" 
                        @update:strictMode="linkedinStrictMode = $event"
                        :showStrictToggle="linkedinActiveResultsTab === 'topPicks'"
                        :isTopPicksTab="linkedinActiveResultsTab === 'topPicks'"
                        emptyMessage="Search for jobs to see results..." 
                    />
                </main>
            </div>

            <!-- Job Boards View -->
            <div v-show="activeTab === 'boards'" class="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <BoardSidebar @execute-board-search="executeBoardSearch" />
                <main class="lg:col-span-8 space-y-8">
                    <SearchGoalCard :goal="boardData.goal" />
                    
                    <div class="flex gap-6 border-b border-slate-200 mb-6 items-center justify-between">
                        <div class="flex gap-8">
                            <button @click="boardActiveResultsTab = 'topPicks'" :class="['pb-3 text-sm font-bold flex items-center gap-2 transition-all', boardActiveResultsTab === 'topPicks' ? 'tab-active' : 'text-slate-400 hover:text-slate-600']">
                                Target Matches <span class="bg-slate-900 text-white px-2 py-0.5 rounded text-[10px]">{{ boardStrictCount }}</span>
                            </button>
                            <button @click="boardActiveResultsTab = 'allJobs'" :class="['pb-3 text-sm font-bold flex items-center gap-2 transition-all', boardActiveResultsTab === 'allJobs' ? 'tab-active' : 'text-slate-400 hover:text-slate-600']">
                                Raw Board <span class="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-[10px]">{{ boardData.allJobs.length }}</span>
                            </button>
                        </div>
                    </div>

                    <JobTable 
                        :jobs="boardJobs" 
                        :strictMode="boardStrictMode" 
                        @update:strictMode="boardStrictMode = $event"
                        @deep-find="handleDeepFind"
                        :showStrictToggle="boardActiveResultsTab === 'topPicks'"
                        :isTopPicksTab="boardActiveResultsTab === 'topPicks'"
                        :showDeepFind="true"
                        emptyMessage="Select a board to view openings..." 
                    />
                </main>
            </div>
        </div>

        <SettingsModal />
        <DeepAnalyzeModal 
            :isOpen="isAnalysisModalOpen" 
            :job="analyzingJob" 
            :analysis="analysisResult" 
            :criteria="activeTab === 'linkedin' ? linkedinData.goal : boardData.goal"
            @close="isAnalysisModalOpen = false"
            @reload-summary="handleReloadSummary"
        />
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import axios from 'axios';
import SearchSidebar from './components/SearchSidebar.vue';
import BoardSidebar from './components/BoardSidebar.vue';
import JobTable from './components/JobTable.vue';
import SearchGoalCard from './components/SearchGoalCard.vue';
import SettingsModal from './components/SettingsModal.vue';
import DeepAnalyzeModal from './components/DeepAnalyzeModal.vue';
import { useSettings } from './composables/useSettings';

const { isSettingsOpen, selectedModel, aiBaseUrl } = useSettings();

const activeTab = ref('linkedin');

// Deep Analysis State
const isAnalysisModalOpen = ref(false);
const analyzingJob = ref<any>(null);
const analysisResult = ref<any>(null);

// LinkedIn State
const linkedinData = ref({ allJobs: [] as any[], topPicks: [] as any[], goal: null, aiError: "" });
const linkedinActiveResultsTab = ref('topPicks');
const linkedinStrictMode = ref(true);

const linkedinStrictCount = computed(() => linkedinData.value.topPicks.filter(j => linkedinStrictMode.value ? j.isVetted : true).length);
const linkedinJobs = computed(() => {
    let jobs = linkedinActiveResultsTab.value === 'topPicks' ? linkedinData.value.topPicks : linkedinData.value.allJobs;
    if (linkedinActiveResultsTab.value === 'topPicks' && linkedinStrictMode.value) jobs = jobs.filter(j => j.isVetted);
    return jobs;
});

// Board State
const boardData = ref({ allJobs: [] as any[], topPicks: [] as any[], goal: null, aiError: "" });
const boardActiveResultsTab = ref('topPicks');
const boardStrictMode = ref(true);

const boardStrictCount = computed(() => boardData.value.topPicks.filter(j => boardStrictMode.value ? j.isVetted : true).length);
const boardJobs = computed(() => {
    let jobs = boardActiveResultsTab.value === 'topPicks' ? boardData.value.topPicks : boardData.value.allJobs;
    if (boardActiveResultsTab.value === 'topPicks' && boardStrictMode.value) jobs = jobs.filter(j => j.isVetted);
    return jobs;
});

const executeLinkedInSearch = async (formPayload: any, updateStatus: (loading: boolean, text: string) => void) => {
    updateStatus(true, "Analyzing search intent...");
    linkedinData.value = { allJobs: [], topPicks: [], goal: null, aiError: "" };
    
    const payload = { ...formPayload, model: selectedModel.value, baseUrl: aiBaseUrl.value };

    // Parallel calls
    axios.post('/api/goal', payload)
        .then(res => {
            linkedinData.value.goal = res.data;
            updateStatus(true, "Crawling LinkedIn with optimized terms...");
        }).catch(err => console.warn(err));

    try {
        const res = await axios.post('/api/search', payload);
        linkedinData.value = { ...linkedinData.value, ...res.data };
    } catch(err) {
        linkedinData.value.aiError = "Failed to fetch jobs.";
    } finally {
        updateStatus(false, "");
    }
};

const executeBoardSearch = async (formPayload: any, updateStatus: (loading: boolean, text: string) => void) => {
    updateStatus(true, "Parsing board targets...");
    boardData.value = { allJobs: [], topPicks: [], goal: null, aiError: "" };
    
    const payload = { ...formPayload, model: selectedModel.value, baseUrl: aiBaseUrl.value };

    axios.post('/api/goal', { keyword: formPayload.keyword, targetCountry: formPayload.targetCountry, location: 'Any', model: selectedModel.value, baseUrl: aiBaseUrl.value })
        .then(res => {
            boardData.value.goal = res.data;
            updateStatus(true, "Filtering board matches...");
        }).catch(err => console.warn(err));

    try {
        const res = await axios.post('/api/greenhouse/search', payload);
        boardData.value = { ...boardData.value, ...res.data };
    } catch(err) {
        boardData.value.aiError = "Board search failed.";
    } finally {
        updateStatus(false, "");
    }
};

const handleDeepFind = async (job: any) => {
    analyzingJob.value = job;
    analysisResult.value = null;
    isAnalysisModalOpen.value = true;

    try {
        const res = await axios.post('/api/greenhouse/deep-analyze', {
            content: job.content,
            searchGoal: boardData.value.goal,
            model: selectedModel.value,
            baseUrl: aiBaseUrl.value
        });
        analysisResult.value = res.data;
    } catch (err: any) {
        analysisResult.value = {
            summary: "Error: " + (err.response?.data?.error || err.message),
            score: 0,
            reasons: ["Failed to retrieve deep analysis."]
        };
    }
};

const handleReloadSummary = async () => {
    if (!analyzingJob.value || !analysisResult.value) return;
    
    try {
        const res = await axios.post('/api/greenhouse/deep-summary', {
            content: analyzingJob.value.content,
            model: selectedModel.value,
            baseUrl: aiBaseUrl.value
        });
        analysisResult.value.summary = res.data.summary;
    } catch (err: any) {
        console.error("Summary reload failed:", err);
    }
};

const exportCsv = () => {
    const isLinkedIn = activeTab.value === 'linkedin';
    const activeResultsTab = isLinkedIn ? linkedinActiveResultsTab.value : boardActiveResultsTab.value;
    const dataObj = isLinkedIn ? linkedinData.value : boardData.value;
    const jobs = activeResultsTab === 'topPicks' ? dataObj.topPicks : dataObj.allJobs;
    
    if (!jobs.length) return;
    let csv = 'Position,Company,Location,URL\n';
    jobs.forEach(j => {
        csv += `"${j.position.replace(/"/g, '""')}","${j.company.replace(/"/g, '""')}","${j.location.replace(/"/g, '""')}","${j.jobUrl}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'jobs.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};
</script>
