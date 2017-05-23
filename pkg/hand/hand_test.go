package hand

import (
	"fmt"
	"testing"
)

func equal(x, y []int) bool {
	if len(x) != len(y) {
		return false
	}
	for i := range x {
		if x[i] != y[i] {
			return false
		}
	}
	return true
}

func TestEvaluate(t *testing.T) {
	var tests = []struct {
		cards string
		value int
		mask  []int
	}{
		{"AdAsQcJd5cKhTh", 0x5edcba, []int{1, 1, 0, 1, 1, 1, 0}},
		{"AdAsQcJd5c4hTh", 0x2eecba, []int{1, 1, 0, 0, 1, 1, 1}},
		{"AdAsQcJd5cAhTh", 0x4eeecb, []int{1, 1, 0, 1, 0, 1, 1}},
		{"Ad2sQcJd5c8hTh", 0x1ecba8, []int{1, 1, 0, 1, 1, 1, 0}},
		{"AdAhQcJh5hKhTh", 0x6edba5, []int{0, 1, 1, 1, 1, 0, 1}},
		{"AdAsTcJdAcKhTh", 0x7eeeaa, []int{1, 0, 1, 0, 1, 1, 1}},
		{"AdAsQcJdAcAhJh", 0x8eeeec, []int{1, 0, 1, 1, 0, 1, 1}},
		{"AdAsQcJd5cJhTh", 0x3eebbc, []int{1, 1, 0, 1, 0, 1, 1}},
		{"AdAsQdJd5cKdTd", 0x9edcba, []int{1, 1, 0, 1, 1, 1, 0}},
	}
	for _, test := range tests {

		c := evaluate(cardValue(test.cards[0:4]), cardValue(test.cards[4:]))

		if c.value != test.value {
			t.Errorf("%s\t%x\t%x\t%v\t%v", test.cards, test.value, c.value, test.mask, c.mask)
		}
		if !equal(c.mask, test.mask) {
			t.Errorf("%s\t%x\t%x\t%v\t%v", test.cards, test.value, c.value, test.mask, c.mask)
		}
	}
}

func TestNew(t *testing.T) {
	h := *NewHand(1234, 1)
	fmt.Println(h)
	fmt.Println(h.player[0].mask)
}
