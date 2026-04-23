class CreateLakes < ActiveRecord::Migration[8.1]
  def change
    create_table :lakes do |t|
      t.string :name
      t.string :location
      t.text :description

      t.timestamps
    end
  end
end
