<template>
    <div v-if="isSettingsOpen" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <div class="bg-white border border-slate-200 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div class="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div>
                    <h2 class="text-base font-bold text-slate-900">System Configuration</h2>
                    <p class="text-[10px] text-slate-500 mt-0.5">Manage localized AI inference parameters</p>
                </div>
                <button type="button" @click="closeSettings" class="p-2 hover:bg-white/5 rounded-full transition-all text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            
            <div class="p-8 space-y-5">
                <div class="space-y-1.5">
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Inference Endpoint</label>
                    <input type="text" v-model="localAiBaseUrl" placeholder="http://localhost:8001/v1" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-xs text-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-all font-mono">
                </div>
                <div class="space-y-1.5">
                    <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Model ID</label>
                    <select v-model="localSelectedModel" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-xs text-slate-900 focus:ring-1 focus:ring-slate-900 outline-none transition-all appearance-none cursor-pointer">
                        <option v-if="models.length === 0" value="">Querying regional models...</option>
                        <option v-for="m in models" :key="m.id" :value="m.id">{{ m.id }}</option>
                    </select>
                </div>

                <!-- Diagnostic Section -->
                <div class="pt-2">
                    <button type="button" @click="runDiagnostics" :disabled="isDiagnosing" class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-slate-200 transition-all disabled:opacity-50">
                        <div v-if="isDiagnosing" class="animate-spin rounded-full h-3 w-3 border-b-2 border-slate-900"></div>
                        <span v-if="isDiagnosing">Running Health Probe... {{ diagnosticAttempt > 0 ? `(Attempt ${diagnosticAttempt}/5)` : '' }}</span>
                        <span v-else>Diagnostic Pulse</span>
                    </button>

                    <div v-if="diagnosticResults" class="mt-4 p-4 bg-slate-900 rounded-lg border border-slate-800 space-y-3">
                        <div class="flex items-center justify-between">
                            <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Health Report</span>
                            <span :class="['text-[9px] font-bold uppercase px-2 py-0.5 rounded', diagnosticResults.status === 'optimal' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400']">
                                {{ diagnosticResults.status }}
                            </span>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <div class="text-[8px] text-slate-500 uppercase font-bold">Attempts</div>
                                <div class="text-xs font-mono text-slate-300">{{ diagnosticResults.totalAttempts }} / 5</div>
                            </div>
                            <div>
                                <div class="text-[8px] text-slate-500 uppercase font-bold">Avg Latency</div>
                                <div class="text-xs font-mono text-slate-300">{{ avgLatency }}ms</div>
                            </div>
                        </div>
                        <div class="pt-2 border-t border-slate-800">
                            <div class="text-[8px] text-slate-500 uppercase font-bold mb-1">AI Logic Assessment</div>
                            <p class="text-[11px] text-slate-300 leading-relaxed italic">
                                "{{ diagnosticResults.healthSummary }}"
                            </p>
                        </div>
                    </div>
                </div>

                <div class="pt-4 flex justify-end space-x-3">
                    <button type="button" @click="closeSettings" class="px-5 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-lg transition-all">Cancel</button>
                    <button type="button" @click="saveSettings" class="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-sm transition-all text-white">
                        Apply Changes
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import axios from 'axios';
import { useSettings } from '../composables/useSettings';

const { isSettingsOpen, selectedModel, aiBaseUrl } = useSettings();

const localSelectedModel = ref(selectedModel.value);
const localAiBaseUrl = ref(aiBaseUrl.value);
const models = ref<{id: string}[]>([]);

// Diagnostic State
interface Diagnostics {
    totalAttempts: number;
    latencies: number[];
    healthSummary: string;
    status: string;
}
const isDiagnosing = ref(false);
const diagnosticAttempt = ref(0);
const diagnosticResults = ref<Diagnostics | null>(null);

const avgLatency = computed(() => {
    if (!diagnosticResults.value) return 0;
    const valid = diagnosticResults.value.latencies.filter(l => l > 0);
    return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
});

const fetchModels = async () => {
    try {
        const res = await axios.get(`/api/models?baseUrl=${encodeURIComponent(localAiBaseUrl.value)}`);
        models.value = res.data.data || [];
        if (models.value.length === 0) {
            models.value = [{ id: localSelectedModel.value }];
        }
    } catch (err) {
        models.value = [{ id: localSelectedModel.value }];
    }
};

watch(isSettingsOpen, (newVal) => {
    if (newVal) {
        localSelectedModel.value = selectedModel.value;
        localAiBaseUrl.value = aiBaseUrl.value;
        fetchModels();
    }
});

onMounted(() => { fetchModels(); });

const closeSettings = () => { 
    isSettingsOpen.value = false; 
    diagnosticResults.value = null; // Clear on close
};

const runDiagnostics = async () => {
    isDiagnosing.value = true;
    diagnosticResults.value = null;
    diagnosticAttempt.value = 1;

    try {
        const res = await axios.post('/api/ai/diagnostics', {
            model: localSelectedModel.value,
            baseUrl: localAiBaseUrl.value
        });
        diagnosticResults.value = res.data;
    } catch (err: any) {
        diagnosticResults.value = {
            totalAttempts: 5,
            latencies: [-1],
            healthSummary: "Connection failed. Ensure the inference server is running at the specified pulse endpoint.",
            status: 'offline'
        };
    } finally {
        isDiagnosing.value = false;
        diagnosticAttempt.value = 0;
    }
};

const saveSettings = () => {
    selectedModel.value = localSelectedModel.value;
    aiBaseUrl.value = localAiBaseUrl.value;
    closeSettings();
};
</script>
