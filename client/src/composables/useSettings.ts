import { ref, watch } from 'vue';

const selectedModel = ref(localStorage.getItem('selectedModel') || "NexaAI/OmniNeural-4B");
const aiBaseUrl = ref(localStorage.getItem('aiBaseUrl') || "http://localhost:8001/v1");
const isSettingsOpen = ref(false);

watch(selectedModel, (val) => {
    localStorage.setItem('selectedModel', val);
});
watch(aiBaseUrl, (val) => {
    localStorage.setItem('aiBaseUrl', val);
});

export function useSettings() {
    return {
        selectedModel,
        aiBaseUrl,
        isSettingsOpen
    };
}
