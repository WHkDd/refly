import { Segmented, Tooltip } from 'antd';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconAskAI,
  IconPilot,
  IconImage,
} from '@refly-packages/ai-workspace-common/components/common/icon';
import { ChatMode } from '@refly-packages/ai-workspace-common/stores/chat';

interface ChatModeSelectorProps {
  chatMode: ChatMode;
  setChatMode: (mode: ChatMode) => void;
  className?: string;
}

export const ChatModeSelector = memo(
  ({ chatMode, setChatMode, className }: ChatModeSelectorProps) => {
    const { t } = useTranslation();

    return (
      <Segmented
        size="small"
        shape="round"
        value={chatMode}
        onChange={(value) => setChatMode(value as ChatMode)}
        options={[
          {
            label: (
              <Tooltip title={t('mode.askDescription')}>
                <div className="flex items-center gap-1.5">
                  <IconAskAI className="text-sm" />
                  <span className="text-xs">{t('mode.ask')}</span>
                </div>
              </Tooltip>
            ),
            value: 'ask',
          },
          {
            label: (
              <Tooltip title={t('mode.agentDescription')}>
                <div className="flex items-center gap-1.5">
                  <IconPilot className="text-sm" />
                  <span className="text-xs">{t('mode.agent')}</span>
                </div>
              </Tooltip>
            ),
            value: 'agent',
          },
          {
            label: (
              <Tooltip title={t('mode.mediaDescription')}>
                <div className="flex items-center gap-1.5">
                  <IconImage className="text-sm" />
                  <span className="text-xs">{t('mode.media')}</span>
                </div>
              </Tooltip>
            ),
            value: 'media',
          },
        ]}
        className={className}
      />
    );
  },
);

ChatModeSelector.displayName = 'ChatModeSelector';
