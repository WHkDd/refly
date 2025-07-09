import { memo, useCallback, useMemo, useState } from 'react';
import { Button, Divider, Dropdown, DropdownProps, MenuProps, Skeleton } from 'antd';
import { useTranslation } from 'react-i18next';
import { ModelIcon } from '@lobehub/icons';
import { getPopupContainer } from '@refly-packages/ai-workspace-common/utils/ui';
import { ProviderItem } from '@refly/openapi-schema';
import { LuInfo } from 'react-icons/lu';
import {
  SettingsModalActiveTab,
  useSiderStoreShallow,
} from '@refly-packages/ai-workspace-common/stores/sider';
import { DownOutlined } from '@ant-design/icons';
import { SettingsButton } from '@refly-packages/ai-workspace-common/components/canvas/launchpad/chat-actions/model-selector';
import { useChatStoreShallow } from '@refly-packages/ai-workspace-common/stores/chat';
import './index.scss';

interface MediaModelSelectorProps {
  model: ProviderItem | null;
  setModel: (model: ProviderItem | null) => void;
  readonly?: boolean;
  placement?: DropdownProps['placement'];
  trigger?: DropdownProps['trigger'];
  defaultModel?: ProviderItem | null;
  mediaModelList?: ProviderItem[];
  loading?: boolean;
}

// Memoize the selected model display
const SelectedMediaModelDisplay = memo(
  ({
    model,
    handleOpenSettingModal,
  }: { model: ProviderItem | null; handleOpenSettingModal: () => void }) => {
    const { t } = useTranslation();

    if (!model) {
      return (
        <Button
          type="text"
          size="small"
          className="text-xs gap-1.5"
          style={{ color: '#f59e0b' }}
          icon={<LuInfo className="flex items-center" />}
          onClick={handleOpenSettingModal}
        >
          {t('copilot.modelSelector.configureModel')}
        </Button>
      );
    }

    return (
      <Button
        type="text"
        size="small"
        className="text-xs gap-1.5"
        icon={<ModelIcon model={model.name} type={'color'} />}
      >
        {model.name}
        <DownOutlined />
      </Button>
    );
  },
);

SelectedMediaModelDisplay.displayName = 'SelectedMediaModelDisplay';

const MediaModelLabel = memo(({ model }: { model: ProviderItem }) => {
  return <span className="text-xs flex items-center gap-1">{model.name}</span>;
});

MediaModelLabel.displayName = 'MediaModelLabel';

// Helper function to get media type from model capabilities
const getMediaTypeFromCapabilities = (model: ProviderItem): string => {
  const config = model.config as any;
  if (!config?.capabilities) return 'image';

  if (config.capabilities.image) return 'image';
  if (config.capabilities.video) return 'video';
  if (config.capabilities.audio) return 'audio';

  return 'image'; // Default fallback
};

// Helper function to get media type label
const getMediaTypeLabel = (mediaType: string, t: any): string => {
  switch (mediaType) {
    case 'image':
      return t('canvas.nodes.mediaSkill.image', 'Image');
    case 'video':
      return t('canvas.nodes.mediaSkill.video', 'Video');
    case 'audio':
      return t('canvas.nodes.mediaSkill.audio', 'Audio');
    default:
      return t('canvas.nodes.mediaSkill.image', 'Image');
  }
};

export const MediaModelSelector = memo(
  ({
    placement = 'bottomLeft',
    trigger = ['click'],
    setModel,
    readonly = false,
    model,
    mediaModelList,
    loading,
  }: MediaModelSelectorProps) => {
    const { t } = useTranslation();
    const [dropdownOpen, setDropdownOpen] = useState(false);

    const { setShowSettingModal, setSettingsModalActiveTab } = useSiderStoreShallow((state) => ({
      setShowSettingModal: state.setShowSettingModal,
      setSettingsModalActiveTab: state.setSettingsModalActiveTab,
    }));

    const { setMediaSelectedModel } = useChatStoreShallow((state) => ({
      setMediaSelectedModel: state.setMediaSelectedModel,
    }));

    const handleOpenSettingModal = useCallback(() => {
      setShowSettingModal(true);
      setSettingsModalActiveTab(SettingsModalActiveTab.ModelConfig);
    }, [setShowSettingModal, setSettingsModalActiveTab]);

    // Group models by media type based on capabilities
    const groupedModels = useMemo(() => {
      if (!mediaModelList?.length) return [];

      const groups: { [key: string]: ProviderItem[] } = {
        image: [],
        video: [],
        audio: [],
      };

      for (const model of mediaModelList) {
        if (model.enabled) {
          const mediaType = getMediaTypeFromCapabilities(model);
          groups[mediaType].push(model);
        }
      }

      return Object.entries(groups)
        .filter(([_, models]) => models.length > 0)
        .map(([mediaType, models]) => ({
          mediaType,
          label: getMediaTypeLabel(mediaType, t),
          models,
        }));
    }, [mediaModelList, t]);

    const droplist: MenuProps['items'] = useMemo(() => {
      const list: any[] = [];

      for (let index = 0; index < groupedModels.length; index++) {
        const group = groupedModels[index];

        // Add group header
        list.push({
          key: `group-${group.mediaType}`,
          type: 'group',
          label: (
            <Divider
              className="!my-1 !p-0"
              variant="dashed"
              orientation="left"
              orientationMargin="0"
            >
              <div className="text-[13px] max-w-[300px] truncate">{group.label}</div>
            </Divider>
          ),
        });

        for (const model of group.models) {
          list.push({
            key: model.itemId,
            label: <MediaModelLabel model={model} />,
            icon: <ModelIcon model={model.name} size={16} type={'color'} />,
          });
        }
      }

      // Add settings button at the bottom
      if (list.length > 0) {
        list.push({
          key: 'settings',
          type: 'divider',
          className: '!my-1',
        });
      }

      list.push({
        key: 'settings-button',
        label: (
          <SettingsButton
            handleOpenSettingModal={handleOpenSettingModal}
            setDropdownOpen={setDropdownOpen}
          />
        ),
      });

      return list;
    }, [groupedModels, handleOpenSettingModal, setDropdownOpen]);

    const handleMenuClick = useCallback(
      ({ key }: { key: string }) => {
        if (key === 'settings-button') return;

        const selectedModel = mediaModelList?.find((model) => model.itemId === key);
        if (selectedModel) {
          setModel(selectedModel);
          setMediaSelectedModel(selectedModel);
        }
      },
      [mediaModelList, setModel],
    );

    if (loading) {
      return <Skeleton className="w-28" active paragraph={false} />;
    } else if (!mediaModelList?.length) {
      return (
        <Button
          type="text"
          size="small"
          className="text-xs text-orange-500"
          danger={true}
          icon={<LuInfo className="flex items-center" />}
        >
          {t('copilot.modelSelector.configureModel')}
        </Button>
      );
    }

    return (
      <Dropdown
        menu={{
          items: droplist,
          onClick: handleMenuClick,
        }}
        placement={placement}
        trigger={trigger}
        open={dropdownOpen}
        onOpenChange={setDropdownOpen}
        getPopupContainer={getPopupContainer}
        overlayClassName="media-model-selector-overlay"
        autoAdjustOverflow={true}
        disabled={readonly}
      >
        <span className="text-xs flex items-center gap-1.5 text-gray-500 cursor-pointer transition-all duration-300 hover:text-gray-700">
          <SelectedMediaModelDisplay
            model={model}
            handleOpenSettingModal={handleOpenSettingModal}
          />
        </span>
      </Dropdown>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.placement === nextProps.placement &&
      prevProps.readonly === nextProps.readonly &&
      prevProps.model === nextProps.model &&
      prevProps.defaultModel === nextProps.defaultModel &&
      JSON.stringify(prevProps.trigger) === JSON.stringify(nextProps.trigger) &&
      JSON.stringify(prevProps.mediaModelList) === JSON.stringify(nextProps.mediaModelList)
    );
  },
);

MediaModelSelector.displayName = 'MediaModelSelector';
