import {
    init as amplitudeInit,
    track as amplitudeTrack,
} from '@amplitude/analytics-node';
import machine from 'node-machine-id';
import { getAddress } from './arweaveHelper';
import { withAsync } from './withAsync';

const AMPLITUDE_TRACKING_ID = '92a463755ed8c8b96f0f2353a37b7b2';
const PLATFORM = '@protocol.land/git-remote-helper';

let isInitialized = false;

const initializeAmplitudeAnalytics = async () => {
    if (isInitialized) return;

    await amplitudeInit(AMPLITUDE_TRACKING_ID).promise;
    isInitialized = true;
};

export const trackAmplitudeAnalyticsEvent = async (
    category: string,
    action: string,
    label: string,
    wallet: any,
    data?: Record<any, any>
) => {
    try {
        let eventOptions: { user_id?: string; device_id?: string } = {
            user_id: undefined,
            device_id: undefined,
        };

        await initializeAmplitudeAnalytics();

        const { response: userAddress } = await withAsync(() => {
            if (wallet) {
                return getAddress(wallet);
            }
            return '';
        });
        if (userAddress) {
            eventOptions = { user_id: userAddress };
        } else {
            const { response: machineId } = await withAsync(() =>
                machine.machineId(true)
            );
            if (machineId) {
                eventOptions = { device_id: machineId };
            }
        }
        if (eventOptions?.user_id || eventOptions?.device_id) {
            await amplitudeTrack(
                category,
                {
                    action,
                    label,
                    platform: PLATFORM,
                    ...data,
                },
                eventOptions
            ).promise;
        }
    } catch (error) {
        // console.error('Amplitude Analytics Error:', error);
    }
};

export const trackRepositoryUpdateEvent = async (
    wallet: any,
    data: Record<any, any>
) => {
    await trackAmplitudeAnalyticsEvent(
        'Repository',
        'Add files to repo',
        'Add files',
        wallet,
        data
    );
};

export const trackRepositoryCloneEvent = async (
    wallet: any,
    data: Record<any, any>
) => {
    await trackAmplitudeAnalyticsEvent(
        'Repository',
        'Clone a repo',
        'Clone repo',
        wallet,
        data
    );
};
