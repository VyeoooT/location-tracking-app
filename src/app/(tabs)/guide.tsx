import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

export default function GuideScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + BottomTabInset + Spacing.four },
        ]}
      >
        <ThemedView style={styles.header}>
          <ThemedText type="title">📍 Hướng dẫn sử dụng</ThemedText>
          <ThemedText style={styles.subtitle}>
            Ghi lại và chia sẻ hành trình với người thân
          </ThemedText>
        </ThemedView>

        <Collapsible title="🚀 Bắt đầu hành trình">
          <ThemedText type="small">
            Mở tab Home và bấm nút “Bắt đầu hành trình”. App sẽ yêu cầu quyền
            truy cập vị trí — hãy cho phép để app ghi nhận vị trí ngay cả khi
            khoá màn hình.
          </ThemedText>
        </Collapsible>

        <Collapsible title="📡 Đang theo dõi">
          <ThemedText type="small">
            Khi đang theo dõi, sẽ có thông báo “Đang theo dõi hành trình” trên
            thanh trạng thái. Đừng tắt thông báo này — Android giữ nó để không
            dừng tiến trình ghi GPS nền.
          </ThemedText>
        </Collapsible>

        <Collapsible title="🌐 Chia sẻ với người thân">
          <ThemedText type="small">
            Bấm “Sao chép link” trên màn hình theo dõi rồi gửi cho người thân.
            Họ mở link để xem vị trí của bạn trên bản đồ web theo thời gian
            thực.
          </ThemedText>
        </Collapsible>

        <Collapsible title="📋 Lịch sử hành trình">
          <ThemedText type="small">
            Tab History hiển thị các chuyến đã đi: ngày giờ, thời lượng và số
            điểm GPS. Bấm vào một chuyến để xem lại trên bản đồ hoặc chia sẻ lại
            link.
          </ThemedText>
        </Collapsible>

        <Collapsible title="🔋 Lưu ý về pin">
          <ThemedText type="small">
            Một số máy Android tối ưu pin có thể ngừng app ở nền. Vào Cài đặt →
            Pin → Đặt “Không giới hạn” cho Location Tracker để app chạy ổn định
            suốt hành trình.
          </ThemedText>
        </Collapsible>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
    gap: Spacing.three,
  },
  header: {
    paddingTop: Spacing.five,
    paddingBottom: Spacing.two,
    gap: Spacing.one,
  },
  subtitle: {
    opacity: 0.7,
  },
});
