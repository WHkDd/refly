import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { Popover, Select, Button, Divider, message, Tooltip } from 'antd';
import { ButtonProps } from 'antd/es/button';
import {
  IconShare,
  IconClose,
  IconLink,
  IconTemplate,
  IconRefresh,
} from '@refly-packages/ai-workspace-common/components/common/icon';
import { RiUserForbidLine } from 'react-icons/ri';
import { GrLanguage } from 'react-icons/gr';
import { useTranslation } from 'react-i18next';
import getClient from '@refly-packages/ai-workspace-common/requests/proxiedRequest';
import { CreateTemplateModal } from '@refly-packages/ai-workspace-common/components/canvas-template/create-template-modal';
import { useListShares } from '@refly-packages/ai-workspace-common/queries';
import { getShareLink } from '@refly-packages/ai-workspace-common/utils/share';
import { useExportCanvasAsImage } from '@refly-packages/ai-workspace-common/hooks/use-export-canvas-as-image';

type ShareAccess = 'off' | 'anyone';

interface ShareSettingsProps {
  canvasId: string;
  canvasTitle: string;
}

const labelRender = (props: any) => {
  const { label, value, title } = props;
  return (
    <div className="flex items-center gap-2">
      <div
        className={`text-white rounded-lg h-[30px] w-[30px] flex items-center justify-center translate-y-1 dark:text-gray-900 ${
          value === 'off' ? 'bg-gray-500 dark:bg-gray-400' : 'bg-green-600 dark:bg-green-500'
        }`}
      >
        {value === 'off' ? (
          <RiUserForbidLine className="w-6 h-6" />
        ) : (
          <GrLanguage className="w-6 h-6" />
        )}
      </div>
      <div className="text-sm py-1 flex flex-col">
        <div className="font-medium">{label}</div>
        <div className="text-xs leading-none">{title}</div>
      </div>
    </div>
  );
};

const optionRender = (props: any) => {
  const { value, label } = props;
  return (
    <div className="flex items-center gap-2">
      {value === 'off' ? (
        <RiUserForbidLine className="w-4 h-4" />
      ) : (
        <GrLanguage className="w-4 h-4" />
      )}
      {label}
    </div>
  );
};

// Memoized ShareSettings component for better performance
const ShareSettings = React.memo(({ canvasId, canvasTitle }: ShareSettingsProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [createTemplateModalVisible, setCreateTemplateModalVisible] = useState(false);
  const [access, setAccess] = useState<ShareAccess>('off');
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateShareLoading, setUpdateShareLoading] = useState(false);

  const accessOptions = useMemo(
    () => [
      {
        label: t('shareContent.accessOptions.off'),
        value: 'off',
        title: t('shareContent.accessOptions.offDescription'),
      },
      {
        label: t('shareContent.accessOptions.anyone'),
        value: 'anyone',
        title: t('shareContent.accessOptions.anyoneDescription'),
      },
    ],
    [t],
  );
  const {
    data,
    refetch: refetchShares,
    isLoading: isLoadingShares,
  } = useListShares({
    query: { entityId: canvasId, entityType: 'canvas' },
  });

  // Get the latest share record that is not a template
  const shareRecord = useMemo(
    () => data?.data?.filter((shareRecord) => !shareRecord.templateId)[0],
    [data],
  );
  const shareLink = useMemo(
    () => getShareLink('canvas', shareRecord?.shareId ?? ''),
    [shareRecord],
  );

  const { uploadCanvasCover } = useExportCanvasAsImage();

  // Memoized function to re-share latest content before copying link
  const updateShare = useCallback(async () => {
    if (access === 'off') return;

    // Asynchronously create new share with latest content
    (async () => {
      try {
        setUpdateShareLoading(true);
        const { storageKey } = await uploadCanvasCover();
        const { data, error } = await getClient().createShare({
          body: {
            entityId: canvasId,
            entityType: 'canvas',
            allowDuplication: true,
            coverStorageKey: storageKey,
          },
        });

        if (data?.success && !error) {
          message.success(t('shareContent.updateShareSuccess'));
          await refetchShares();
        }
      } catch (error) {
        console.error('Failed to create share:', error);
      } finally {
        setUpdateShareLoading(false);
      }
    })();
  }, [access, canvasId, refetchShares, shareRecord?.shareId, t]);

  const copyLink = useCallback(async () => {
    if (access === 'off') return;
    // Copy link to clipboard immediately for better UX
    const newShareLink = getShareLink('canvas', shareRecord?.shareId ?? '');
    await navigator.clipboard.writeText(newShareLink);
    message.success(t('shareContent.copyLinkSuccess'));
  }, [access, shareRecord?.shareId, t]);

  const buttons = useMemo(
    () => [
      {
        label: 'updateShare',
        icon: <IconRefresh className="w-3 h-3 flex items-center justify-center" />,
        onClick: () => updateShare(),
        disabled: access === 'off' || updateShareLoading,
        type: 'default',
        loading: updateShareLoading,
      },
      {
        label: 'copyLink',
        icon: <IconLink className="w-3 h-3 flex items-center justify-center" />,
        onClick: () => copyLink(),
        disabled: access === 'off',
        type: 'default',
      },
      {
        label: 'publishTemplate',
        icon: <IconTemplate className="w-3 h-3 flex items-center justify-center" />,
        onClick: () => {
          setCreateTemplateModalVisible(true);
          setOpen(false);
        },
        disabled: false,
        type: 'primary',
      },
    ],
    [access, updateShare, t, updateShareLoading],
  );

  useEffect(() => {
    setAccess(shareRecord ? 'anyone' : 'off');
  }, [shareRecord]);

  const updateCanvasPermission = useCallback(
    async (value: ShareAccess) => {
      setUpdateLoading(true);
      let success: boolean;

      try {
        // Get the most recent share data before performing operations
        const latestSharesData = await getClient().listShares({
          query: { entityId: canvasId, entityType: 'canvas' },
        });
        const shareRecords = latestSharesData?.data?.data;
        const latestShareRecord = shareRecords?.filter((shareRecord) => !shareRecord.templateId)[0];

        if (value === 'off') {
          if (latestShareRecord?.shareId) {
            const { data, error } = await getClient().deleteShare({
              body: { shareId: latestShareRecord.shareId },
            });
            success = data?.success && !error;
          } else {
            // No share to delete
            success = true;
          }
        } else {
          const { storageKey } = await uploadCanvasCover();
          const { data, error } = await getClient().createShare({
            body: {
              entityId: canvasId,
              entityType: 'canvas',
              allowDuplication: true,
              coverStorageKey: storageKey,
            },
          });
          success = data?.success && !error;
        }

        if (success) {
          message.success(t('shareContent.updateCanvasPermissionSuccess'));
          setAccess(value);
          await refetchShares();
        }
      } catch (err) {
        console.error('Error updating canvas permission:', err);
        success = false;
      } finally {
        setUpdateLoading(false);
      }
    },
    [canvasId, t, refetchShares],
  );

  const handleAccessChange = useCallback(
    (value: ShareAccess) => {
      updateCanvasPermission(value);
    },
    [updateCanvasPermission],
  );

  // Memoize content to prevent unnecessary re-renders
  const content = useMemo(
    () => (
      <div className="w-[320px]">
        <div className="flex justify-between items-center p-3">
          <div className="flex items-center gap-2">
            <IconShare className="w-4 h-4 flex items-center justify-center" />
            <span className="font-medium">{t('common.share')}</span>
          </div>
          <Button
            type="text"
            size="small"
            icon={<IconClose className="w-4 h-4 flex items-center justify-center" />}
            onClick={() => setOpen(false)}
          />
        </div>
        <Divider className="my-0" />
        <div className="p-5 pt-3 pb-5 canvas-share-setting">
          <div className="text-base font-medium mb-2">{t('shareContent.linkShare')}</div>
          <div className="flex items-center justify-between gap-4">
            <Select
              className="flex-1"
              variant="borderless"
              options={accessOptions}
              value={access}
              loading={updateLoading || isLoadingShares}
              disabled={updateLoading || isLoadingShares}
              onChange={handleAccessChange}
              labelRender={labelRender}
              optionRender={optionRender}
            />
          </div>
        </div>
        <div className="px-3 py-4 bg-[#F5F6F7] flex items-center justify-center gap-2 rounded-b-lg dark:bg-[#1f1f1f]">
          {buttons.map((button) => (
            <Tooltip
              title={t(`shareContent.${button.label}Tooltip`)}
              key={button.label}
              placement="bottom"
            >
              <Button
                className="w-full h-[28px] text-xs"
                type={button.type as ButtonProps['type']}
                icon={button.icon}
                size="small"
                disabled={button.disabled || updateLoading}
                loading={button.loading}
                onClick={() => button.onClick()}
              >
                {t(`shareContent.${button.label}`)}
              </Button>
            </Tooltip>
          ))}
        </div>
      </div>
    ),
    [accessOptions, access, setAccess, t, shareLink, buttons, updateLoading, isLoadingShares],
  );

  return (
    <div>
      <CreateTemplateModal
        canvasId={canvasId}
        title={canvasTitle}
        visible={createTemplateModalVisible}
        setVisible={setCreateTemplateModalVisible}
      />
      <Popover
        className="canvas-share-setting-popover"
        open={open}
        onOpenChange={setOpen}
        trigger="click"
        placement="bottomLeft"
        overlayInnerStyle={{ padding: 0 }}
        content={content}
      >
        <Button type="primary" icon={<IconShare className="flex items-center justify-center" />}>
          {t('common.share')}
        </Button>
      </Popover>
    </div>
  );
});

ShareSettings.displayName = 'ShareSettings';

export default ShareSettings;
